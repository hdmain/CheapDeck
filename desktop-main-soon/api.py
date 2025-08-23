from flask import Flask, jsonify
from flask_cors import CORS
import sys
import os

# Fix encoding for Windows
if os.name == 'nt':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.detach())

app = Flask(__name__)
CORS(app)

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify({
        'message': 'Hello from Python API!',
        'status': 'success',
        'python_version': sys.version
    })

@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'API is running',
        'service': 'Python Flask API',
        'port': 5000
    })

if __name__ == '__main__':
    print("Python API server starting...")
    print("Server will be available at: http://127.0.0.1:5000")
    print("Ready to receive requests from Electron!")
    
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)
