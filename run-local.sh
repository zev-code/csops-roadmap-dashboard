#!/usr/bin/env bash
# Start the Flask API in debug mode on localhost:5000
set -e

cd "$(dirname "$0")/api"

export FLASK_DEBUG=true
export GIT_AUTO_COMMIT=true

echo "Starting Flask API on http://localhost:5000"
python app.py
