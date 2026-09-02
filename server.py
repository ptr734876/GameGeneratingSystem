import os
import sys
import json
import sqlite3
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, 'web')
DB_PATH = os.path.join(BASE_DIR, 'leaderboard.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            score REAL NOT NULL,
            mode TEXT DEFAULT 'hardcore',
            wave INTEGER NOT NULL,
            kills INTEGER NOT NULL,
            duration REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS telemetry_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            username TEXT NOT NULL,
            mode TEXT NOT NULL,
            score REAL NOT NULL,
            wave INTEGER NOT NULL,
            kills INTEGER NOT NULL,
            duration REAL NOT NULL,
            damage REAL NOT NULL,
            dps REAL NOT NULL,
            best_hit REAL NOT NULL,
            apm REAL DEFAULT 0,
            death_cause TEXT,
            actions_distribution_json TEXT,
            sequence_matrix_json TEXT,
            skills_synthesized_json TEXT,
            combat_timeline_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Seed baseline entries if table is empty
    c.execute('SELECT COUNT(*) FROM scores WHERE mode = "hardcore"')
    if c.fetchone()[0] == 0:
        c.execute('INSERT INTO scores (username, score, mode, wave, kills, duration) VALUES (?, ?, ?, ?, ?, ?)',
                  ('ptr734876', 134.25, 'hardcore', 28, 342, 860.0))

    c.execute('SELECT COUNT(*) FROM scores WHERE mode = "fast"')
    if c.fetchone()[0] == 0:
        c.execute('INSERT INTO scores (username, score, mode, wave, kills, duration) VALUES (?, ?, ?, ?, ?, ?)',
                  ('ptr734876', 1342.50, 'fast', 48, 1420, 600.0))

    conn.commit()
    conn.close()

init_db()

class GameServerHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/leaderboard':
            query_params = parse_qs(parsed.query)
            mode_filter = query_params.get('mode', ['all'])[0].lower()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                if mode_filter in ('hardcore', 'fast'):
                    c.execute('''
                        SELECT username, MAX(score) as max_score, mode, wave, kills, duration, created_at
                        FROM scores
                        WHERE mode = ?
                        GROUP BY username
                        ORDER BY max_score DESC
                        LIMIT 10
                    ''', (mode_filter,))
                else:
                    c.execute('''
                        SELECT username, MAX(score) as max_score, mode, wave, kills, duration, created_at
                        FROM scores
                        GROUP BY username, mode
                        ORDER BY max_score DESC
                        LIMIT 10
                    ''')
                rows = c.fetchall()
                conn.close()
                result = [
                    {
                        'rank': idx + 1,
                        'username': r[0],
                        'score': round(r[1], 2),
                        'mode': r[2] or 'hardcore',
                        'wave': r[3],
                        'kills': r[4],
                        'duration': round(r[5], 1),
                        'date': r[6]
                    }
                    for idx, r in enumerate(rows)
                ]
                self.wfile.write(json.dumps(result).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        elif parsed.path == '/api/telemetry/stats':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            try:
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute('SELECT COUNT(*), AVG(score), AVG(duration), AVG(kills) FROM telemetry_sessions')
                row = c.fetchone()
                c.execute('SELECT mode, COUNT(*) FROM telemetry_sessions GROUP BY mode')
                mode_counts = dict(c.fetchall())
                conn.close()
                self.wfile.write(json.dumps({
                    'total_sessions': row[0],
                    'avg_score': round(row[1] or 0, 2),
                    'avg_duration': round(row[2] or 0, 1),
                    'avg_kills': round(row[3] or 0, 1),
                    'mode_breakdown': mode_counts
                }).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
        try:
            data = json.loads(post_data)
        except Exception:
            data = {}

        if parsed.path == '/api/auth':
            username = str(data.get('username', '')).strip() or 'ptr734876'
            password = str(data.get('password', '')).strip()
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute('SELECT id FROM users WHERE username = ?', (username,))
            user = c.fetchone()
            if not user:
                c.execute('INSERT INTO users (username, password) VALUES (?, ?)', (username, password))
                conn.commit()
            conn.close()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'username': username}).encode('utf-8'))
            return

        elif parsed.path == '/api/score':
            username = str(data.get('username', '')).strip() or 'ptr734876'
            score = float(data.get('score', 0.0))
            mode = str(data.get('mode', 'hardcore')).strip()
            wave = int(data.get('wave', 1))
            kills = int(data.get('kills', 0))
            duration = float(data.get('duration', 0.0))

            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute(
                'INSERT INTO scores (username, score, mode, wave, kills, duration) VALUES (?, ?, ?, ?, ?, ?)',
                (username, score, mode, wave, kills, duration)
            )
            conn.commit()
            c.execute('SELECT COUNT(*) FROM scores WHERE mode = ? AND score > ?', (mode, score))
            rank = c.fetchone()[0] + 1
            conn.close()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'rank': rank}).encode('utf-8'))
            return

        elif parsed.path == '/api/telemetry':
            session_id = str(data.get('sessionId', ''))
            username = str(data.get('username', 'ptr734876'))
            mode = str(data.get('mode', 'hardcore'))
            score = float(data.get('score', 0.0))
            wave = int(data.get('wave', 1))
            kills = int(data.get('kills', 0))
            duration = float(data.get('duration', 0.0))
            damage = float(data.get('damage', 0.0))
            dps = float(data.get('dps', 0.0))
            best_hit = float(data.get('bestHit', 0.0))
            apm = float(data.get('apm', 0.0))
            death_cause = str(data.get('deathCause', 'combat'))

            actions_dist = json.dumps(data.get('actionsDistribution', {}))
            seq_matrix = json.dumps(data.get('sequenceMatrix', {}))
            skills_synth = json.dumps(data.get('skillsSynthesized', []))
            timeline = json.dumps(data.get('timeline', []))

            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute('''
                INSERT INTO telemetry_sessions (
                    session_id, username, mode, score, wave, kills, duration,
                    damage, dps, best_hit, apm, death_cause,
                    actions_distribution_json, sequence_matrix_json,
                    skills_synthesized_json, combat_timeline_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                session_id, username, mode, score, wave, kills, duration,
                damage, dps, best_hit, apm, death_cause,
                actions_dist, seq_matrix, skills_synth, timeline
            ))
            conn.commit()
            conn.close()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'saved': True}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

def run(port=4173):
    server = HTTPServer(('0.0.0.0', port), GameServerHandler)
    print(f"SkillGen Server with Separate Mode Leaderboard on http://127.0.0.1:{port}")
    server.serve_forever()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    run(port)
