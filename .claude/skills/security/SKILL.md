# Security Advisor Skill

> Automatically applied during every code operation. No need to invoke manually.

## Activation

This skill activates **automatically** whenever Claude:
- Writes or edits any file (code, config, data, scripts)
- Creates new files
- Reviews code changes before commit
- Handles user input or API endpoints

Claude MUST run the security checklist below on every code change before presenting it as complete.

---

## 1. Secrets & Credentials Scanner

**On every code write/edit, scan for these patterns and BLOCK if found:**

| Pattern | What it catches |
|---|---|
| `sk-ant-[a-zA-Z0-9]{20,}` | Anthropic API keys |
| `sk-[a-zA-Z0-9]{20,}` | OpenAI-style keys |
| `xoxb-[a-zA-Z0-9-]+` | Slack bot tokens |
| `ghp_[a-zA-Z0-9]{36}` | GitHub PATs |
| `AKIA[A-Z0-9]{16}` | AWS access keys |
| `-----BEGIN (RSA\|EC\|OPENSSH) PRIVATE KEY-----` | Private keys |
| `password\s*=\s*['"][^'"]{8,}['"]` | Hardcoded passwords |
| `mongodb(\+srv)?://[^/\s]+` | Database connection strings |
| `postgres(ql)?://[^/\s]+` | PostgreSQL connection strings |
| `redis://[^/\s]+` | Redis connection strings |
| `Bearer [a-zA-Z0-9_\-\.]{20,}` | Bearer tokens |
| `basic [a-zA-Z0-9+/=]{20,}` | Basic auth (base64) |

### When a secret is detected:

**Auto-fix:**
```
# BEFORE (blocked):
API_KEY = "sk-ant-abc123realkey456"

# AFTER (auto-fixed):
API_KEY = os.environ.get("API_KEY")
```

**Action steps:**
1. Replace the hardcoded value with `os.environ.get("VAR_NAME")` (Python) or `process.env.VAR_NAME` (JS)
2. Add the variable name to `.env.example` with a placeholder value
3. Verify `.env` is in `.gitignore`
4. Tell the user: "Found hardcoded secret. Moved to environment variable. Add the real value to your `.env` file."

### .gitignore enforcement

Every project MUST have these entries. If missing, add them:
```
.env
*.pem
*.key
id_rsa
*.p12
*.pfx
```

---

## 2. Injection Prevention

### SQL Injection

**On every database query, check for string concatenation/f-strings:**

```python
# VULNERABLE — block this:
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
cursor.execute("SELECT * FROM users WHERE id = " + user_id)

# SAFE — require this:
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
cursor.execute("SELECT * FROM users WHERE id = :id", {"id": user_id})
```

**Auto-fix:** Convert string concatenation to parameterized queries. Show the user what changed and why.

### Command Injection

**On every subprocess/os.system call, check for unsanitized input:**

```python
# VULNERABLE — block this:
os.system(f"ping {user_input}")
subprocess.run(f"git log {branch_name}", shell=True)
subprocess.run("echo " + user_data, shell=True)

# SAFE — require this:
subprocess.run(["ping", user_input])  # list form, no shell
subprocess.run(["git", "log", branch_name])  # list form
```

**Rules:**
- `shell=True` with any user-controlled data = BLOCK
- `os.system()` with any variable = BLOCK
- Always prefer list-form `subprocess.run(["cmd", "arg1", "arg2"])`
- If `shell=True` is unavoidable, require `shlex.quote()` on every variable

### XSS (Cross-Site Scripting)

**On every HTML/template output, check for unescaped user data:**

```javascript
// VULNERABLE — block this:
element.innerHTML = userInput;
document.write(userData);
`<div>${unsanitizedData}</div>`  // in template literals inserted into DOM

// SAFE — require this:
element.textContent = userInput;  // auto-escapes
```

```python
# VULNERABLE in Flask:
return f"<h1>{user_input}</h1>"

# SAFE — Jinja2 auto-escapes in templates, or:
from markupsafe import escape
return f"<h1>{escape(user_input)}</h1>"
```

### Path Traversal

**On every file operation using user input:**

```python
# VULNERABLE — block this:
filename = request.args.get('file')
with open(f"/data/{filename}") as f:  # ../../etc/passwd

# SAFE — require this:
from pathlib import Path
base = Path("/data").resolve()
target = (base / filename).resolve()
if not str(target).startswith(str(base)):
    abort(403)  # path traversal attempted
```

**Auto-fix:** Wrap file access in path validation. Explain the attack to the user.

---

## 3. Input Validation

### API Endpoints

Every endpoint that accepts user input MUST validate:

```python
# Required pattern for all API input:
def validate_input(data, schema):
    """Validate and sanitize input before processing."""
    # 1. Type check
    if not isinstance(data, dict):
        return None, "Invalid input format"

    # 2. Allowlist fields (reject unknown keys)
    allowed = set(schema.keys())
    unknown = set(data.keys()) - allowed
    if unknown:
        return None, f"Unknown fields: {unknown}"

    # 3. Type + length check each field
    for field, rules in schema.items():
        if field in data:
            value = data[field]
            if not isinstance(value, rules['type']):
                return None, f"{field}: wrong type"
            if isinstance(value, str) and len(value) > rules.get('max_len', 10000):
                return None, f"{field}: too long"

    return data, None
```

**Check for these red flags in any endpoint:**
- `request.args.get()` or `request.json` used without validation
- Integer IDs not cast with `int()` (could receive strings)
- String fields with no length limit (DoS via huge payloads)
- Missing Content-Type checking on POST/PUT

---

## 4. Sensitive Data Handling

### Logging

**Scan every log/print statement for sensitive data:**

```python
# VULNERABLE — block this:
logger.info(f"User login: {username} / {password}")
print(f"API response: {api_key}")
logger.debug(f"Request headers: {request.headers}")  # may contain auth

# SAFE:
logger.info(f"User login: {username}")  # no password
logger.debug(f"API call completed, status={response.status_code}")
```

### Error Messages

```python
# VULNERABLE — leaks internals:
except Exception as e:
    return jsonify({"error": str(e)}), 500  # may expose SQL, paths, etc.

# SAFE:
except Exception as e:
    app.logger.error(f"Internal error: {e}")  # log full detail server-side
    return jsonify({"error": "Internal server error"}), 500  # generic to client
```

### File Permissions

When creating files that contain sensitive data:
```python
import os
# Set restrictive permissions (owner read/write only)
os.chmod(filepath, 0o600)
```

---

## 5. Dependency & Config Security

### HTTP Security Headers

For any web application, verify these headers exist (in nginx config or app):
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 0  (rely on CSP instead)
Content-Security-Policy: <appropriate policy>
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### CORS

```python
# VULNERABLE:
CORS(app)  # allows ALL origins

# SAFE — restrict to known origins:
CORS(app, origins=["https://yourdomain.com"])
```

Flag overly permissive CORS but do NOT auto-fix (may break development). Explain the risk and ask the user what origins to allow.

### Dependencies

When adding packages via pip/npm:
- Check if the package name looks like a typosquat (e.g., `reqeusts` instead of `requests`)
- Warn if adding packages with known vulnerabilities
- Prefer well-maintained packages (check last publish date if uncertain)

---

## 6. Pre-Commit Security Gate

**Before ANY commit, Claude MUST run:**

1. `bash .claude/validate-before-commit.sh` (existing project validator)
2. Additional security scan on all staged changes:

```
Checklist applied to staged diff:
[ ] No hardcoded secrets (patterns from Section 1)
[ ] No SQL string concatenation
[ ] No shell=True with variables
[ ] No innerHTML with user data
[ ] No unvalidated file paths
[ ] No passwords in log statements
[ ] No raw exception messages to client
[ ] .env still in .gitignore
```

If ANY check fails: **stop the commit**, show the finding, offer the fix.

---

## 7. Response Format

When a security issue is found, report it like this:

```
SECURITY: [severity] in [file:line]

  What: [one-line description]
  Risk: [what an attacker could do]
  Fix:  [exact code change]

  [Show the diff: before → after]
```

Severity levels:
- **CRITICAL** — Secrets exposed, injection possible, auth bypass → auto-fix immediately
- **HIGH** — XSS, path traversal, unsafe deserialization → auto-fix, explain
- **MEDIUM** — Missing validation, verbose errors, weak CORS → fix and explain
- **LOW** — Missing headers, logging concerns → note for user, suggest fix

---

## 8. Project-Specific Rules (csops-roadmap-dashboard)

These are patterns already established in this project. Maintain them:

- API key regex scan must use `--exclude-dir=tests` to avoid false positives on test patterns
- Valid statuses are an allowlist: `BACKLOG, PLANNED, NEXT, IN_PROGRESS, DONE` — reject anything else
- `subprocess.run()` in `api/app.py` already uses list form (good) — never regress to `shell=True`
- `.env` is in `.gitignore` — verified by `test_security.py::test_env_file_in_gitignore`
- CSP headers configured in `deploy/nginx-cs-dashq.conf` — check on any nginx changes
- `Config.GIT_AUTO_COMMIT` controls auto-commit — never hardcode git credentials
- Flask CORS is open for development — flag before any production deploy

---

## Summary: What Happens Automatically

Every time Claude writes code in this project:

1. **Scan** the written/edited code against all patterns above
2. **Block** any CRITICAL or HIGH issue from being presented as complete
3. **Auto-fix** when a safe automatic fix exists
4. **Explain** what was found and why it matters (beginner-friendly)
5. **Validate** with `bash .claude/validate-before-commit.sh` before any commit
6. **Report** all findings in the standard format (Section 7)

The user never needs to ask for a security review. It happens on every change.
