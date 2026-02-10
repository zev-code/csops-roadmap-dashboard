from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from config import Config
import os

app = Flask(__name__, static_folder='../static')
app.config.from_object(Config)
CORS(app)


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
