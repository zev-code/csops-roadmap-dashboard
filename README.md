# CS Ops Automation Roadmap Dashboard

A dashboard for tracking and visualizing the Customer Success Operations automation roadmap.

## Tech Stack

- **Backend**: Flask API (Python)
- **Frontend**: Vanilla JavaScript with HTML/CSS
- **Data**: Pandas for data processing

## Local Setup

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd csops-roadmap-dashboard
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

5. Run the development server:
   ```bash
   python api/app.py
   ```

6. Open `http://localhost:5000` in your browser.

## Project Structure

```
csops-roadmap-dashboard/
├── api/           # Flask backend
├── static/        # Frontend assets (HTML, JS, CSS)
├── data/          # Data files
└── deploy/        # Deployment configs (nginx, systemd)
```
