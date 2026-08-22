import random
import time
import uuid
import os
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'typing-game-secret-key-12345!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

WORD_DICTIONARY = {
    'ar': {
        'easy': [
            "قلم", "كتاب", "شمس", "قمر", "ماء", "شجر", "ولد", "بنت", "بيت", "موز", 
            "تمر", "باب", "نور", "ورد", "تفاح", "حليب", "خبز", "عين", "يد", "رجل", 
            "علم", "نجم", "بحر", "نهر", "سمك", "طير", "كلب", "قطة", "فأر", "جمل", 
            "أسد", "فيل", "ثعلب", "ذئب", "نمل", "نحل", "أرض", "سماء", "جبل", "سهل", 
            "رمل", "صخر", "ملح", "زيت", "تين", "بلح", "عنب", "رائد", "خالد", "سالم"
        ],
        'medium': [
            "مدرسة", "مستشفى", "سيارة", "طائرة", "مكتبة", "حديقة", "هاتف", "مفتاح", "طبيب", "معلم", 
            "مهندس", "جامعة", "مسجد", "دفتر", "ساعة", "نظارة", "حقيبة", "قميص", "محفظة", "مسطرة", 
            "صورة", "نافذة", "مطبخ", "حمام", "غرفة", "كرسي", "طاولة", "سرير", "وسادة", "سجادة", 
            "ملعب", "سوق", "دكان", "شارع", "طريق", "جسر", "محطة", "مطار", "فندق", "مطعم", 
            "مخبز", "مطبوع", "رسالة", "بريد", "شاشة", "حاسوب", "لوحة", "مفكرة", "دفتر", "صندوق"
        ],
        'hard': [
            "الديمقراطية", "التكنولوجيا", "الاستراتيجية", "الاستكشاف", "المستودعات", "البيروقراطية", "الكهرومغناطيسية", "الميكروسكوب", "الاستمرارية", "المسؤولية", 
            "الامبراطورية", "البروتوكولات", "الأنثروبولوجيا", "الأيديولوجية", "الديكتاتورية", "الأرستقراطية", "الأوليغارشية", "الجيوبوليتيك", "الديموغرافيا", "الاستباقية", 
            "البتروكيماويات", "النانوتكنولوجي", "الترموديناميكا", "السيكولوجية", "الجيومورفولوجيا", "الأنثروبولوجي", "التنافسية", "الاستقطاب", "الاستقلالية", "البروتوبلازم", 
            "الاستفزازية", "الفسيفساء", "السيبرانية", "الاستدامة", "الاشتقاق", "المصفوفات", "الخوارزميات", "الهيدروليكية", "المجهري", "الجيوفيزياء"
        ]
    },
    'en': {
        'easy': [
            "cat", "dog", "sun", "moon", "tree", "book", "pen", "door", "fish", "bird", 
            "milk", "water", "fire", "rain", "star", "hand", "foot", "home", "game", "word", 
            "blue", "red", "pink", "good", "nice", "love", "hate", "fast", "slow", "high", 
            "low", "jump", "run", "walk", "sing", "song", "play", "work", "time", "year", 
            "week", "day", "food", "meat", "rice", "cake", "milk", "tea", "cold", "warm"
        ],
        'medium': [
            "school", "doctor", "phone", "window", "garden", "street", "computer", "banana", "orange", "kitchen", 
            "market", "teacher", "library", "student", "bottle", "guitar", "keyboard", "monitor", "notebook", "picture", 
            "pencil", "eraser", "ruler", "wallet", "jacket", "bedroom", "cushion", "carpet", "bridge", "station", 
            "airport", "hotel", "restaurant", "bakery", "message", "letter", "screen", "mobile", "castle", "jungle", 
            "forest", "desert", "island", "mountain", "valley", "ocean", "river", "palace", "village", "country"
        ],
        'hard': [
            "algorithm", "developer", "synchronous", "asynchronous", "cryptography", "blockchain", "photosynthesis", "programming", "multiplayer", "optimization", 
            "infrastructure", "architecture", "cybersecurity", "sustainability", "artificial", "intelligence", "globalization", "biodiversity", "thermodynamics", "electrostatic", 
            "microbiology", "stratification", "procrastination", "paradigmatic", "quintessential", "reconciliation", "characteristic", "differentiation", "supercalifragilistic", "exponentials", 
            "cryptocurrency", "multithreading", "parliamentary", "unconstitutional", "experimental", "jurisprudence", "archaeological", "biotechnology", "implementation", "virtualization"
        ]
    }
}

rooms = {}
player_to_room = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    print(f"Client disconnected: {sid}")
    if sid in player_to_room:
        room_id = player_to_room[sid]
        if room_id in rooms:
            room = rooms[room_id]
            player_name = room['players'][sid]['name']
            
            del room['players'][sid]
            del player_to_room[sid]
            
            print(f"Player {player_name} ({sid}) left room {room_id}")
            
            if not room['players']:
                print(f"Room {room_id} is empty. Deleting room.")
                del rooms[room_id]
            else:
                if room['host_sid'] == sid:
                    new_host = list(room['players'].keys())[0]
                    room['host_sid'] = new_host
                    socketio.emit('new_host', {'host_name': room['players'][new_host]['name'], 'host_sid': new_host}, to=room_id)
                    print(f"Host left. New host of room {room_id} is {room['players'][new_host]['name']}")
                
                socketio.emit('player_left', {
                    'name': player_name,
                    'players': get_players_list(room_id)
                }, to=room_id)
                
                if room['status'] == 'playing':
                    check_round_completion(room_id)

def get_players_list(room_id):
    room = rooms[room_id]
    return [
        {
            'sid': sid,
            'name': p['name'],
            'score': p['score'],
            'streak': p['streak'],
            'is_host': (sid == room['host_sid'])
        }
        for sid, p in room['players'].items()
    ]

@socketio.on('create_room')
def handle_create_room(data):
    sid = request.sid
    name = data.get('name', 'Player').strip() or 'Player'
    language = data.get('language', 'ar')
    difficulty = data.get('difficulty', 'medium')
    
    room_id = str(random.randint(1000, 9999))
    while room_id in rooms:
        room_id = str(random.randint(1000, 9999))
        
    rooms[room_id] = {
        'host_sid': sid,
        'language': language,
        'difficulty': difficulty,
        'status': 'waiting',
        'players': {
            sid: {
                'name': name,
                'score': 0,
                'streak': 0,
                'speed_in_round': None
            }
        },
        'word_list': [],
        'current_word_index': -1,
        'current_word': '',
        'word_start_time': 0,
        'round_winners': [],
        'max_rounds': 10
    }
    
    player_to_room[sid] = room_id
    join_room(room_id)
    
    emit('room_created', {
        'room_id': room_id,
        'players': get_players_list(room_id),
        'language': language,
        'difficulty': difficulty,
        'is_host': True
    })
    print(f"Room {room_id} created by {name} ({sid})")

@socketio.on('join_room')
def handle_join_room(data):
    sid = request.sid
    name = data.get('name', 'Player').strip() or 'Player'
    room_id = data.get('room_id', '').strip()
    
    if room_id not in rooms:
        emit('error_message', {'message': 'الغرفة غير موجودة! يرجى التحقق من الرقم.' if data.get('lang') == 'ar' else 'Room not found! Please check the code.'})
        return
        
    room = rooms[room_id]
    
    if room['status'] != 'waiting':
        emit('error_message', {'message': 'اللعبة بدأت بالفعل في هذه الغرفة!' if data.get('lang') == 'ar' else 'Game has already started in this room!'})
        return
        
    room['players'][sid] = {
        'name': name,
        'score': 0,
        'streak': 0,
        'speed_in_round': None
    }
    
    player_to_room[sid] = room_id
    join_room(room_id)
    
    emit('join_success', {
        'room_id': room_id,
        'players': get_players_list(room_id),
        'language': room['language'],
        'difficulty': room['difficulty'],
        'is_host': (sid == room['host_sid'])
    })
    
    socketio.emit('player_joined', {
        'name': name,
        'players': get_players_list(room_id)
    }, to=room_id)
    
    print(f"Player {name} ({sid}) joined room {room_id}")

@socketio.on('start_game')
def handle_start_game():
    sid = request.sid
    if sid not in player_to_room:
        return
        
    room_id = player_to_room[sid]
    room = rooms[room_id]
    
    if room['host_sid'] != sid:
        emit('error_message', {'message': 'المضيف فقط يمكنه بدء اللعبة!'})
        return
        
    lang = room['language']
    diff = room['difficulty']
    dict_words = WORD_DICTIONARY[lang][diff].copy()
    random.shuffle(dict_words)
    
    rounds_count = room['max_rounds']
    selected_words = dict_words[:rounds_count]
    
    room['word_list'] = selected_words
    room['status'] = 'playing'
    room['current_word_index'] = 0
    room['current_word'] = room['word_list'][0]
    room['round_winners'] = []
    
    for p_sid in room['players']:
        room['players'][p_sid]['speed_in_round'] = None
        room['players'][p_sid]['streak'] = 0
        room['players'][p_sid]['score'] = 0
        
    room['word_start_time'] = time.time()
    
    socketio.emit('game_started', {
        'word': room['current_word'],
        'index': 0,
        'total_rounds': len(room['word_list'])
    }, to=room_id)
    
    socketio.start_background_task(round_timer_task, room_id, 0)
    print(f"Game started in room {room_id}. First word: {room['current_word']}")

@socketio.on('submit_word')
def handle_submit_word(data):
    sid = request.sid
    if sid not in player_to_room:
        return
        
    room_id = player_to_room[sid]
    room = rooms[room_id]
    
    if room['status'] != 'playing':
        return
        
    typed_word = data.get('word', '').strip()
    current_word_clean = " ".join(room['current_word'].split())
    typed_word_clean = " ".join(typed_word.split())
    
    if typed_word_clean == current_word_clean:
        if any(w['sid'] == sid for w in room['round_winners']):
            return
            
        speed = time.time() - room['word_start_time']
        player = room['players'][sid]
        player['speed_in_round'] = speed
        
        winner_data = {
            'sid': sid,
            'name': player['name'],
            'speed': speed
        }
        room['round_winners'].append(winner_data)
        
        socketio.emit('player_submitted_correct', {
            'name': player['name'],
            'rank': len(room['round_winners'])
        }, to=room_id)
        
        check_round_completion(room_id)

def check_round_completion(room_id):
    room = rooms[room_id]
    total_players = len(room['players'])
    winners_count = len(room['round_winners'])
    
    if winners_count >= total_players:
        end_round(room_id)
    elif winners_count == 1:
        socketio.start_background_task(end_round_delayed, room_id, room['current_word_index'])

def end_round_delayed(room_id, word_index):
    socketio.sleep(5)
    if room_id in rooms:
        room = rooms[room_id]
        if room['status'] == 'playing' and room['current_word_index'] == word_index:
            end_round(room_id)

def round_timer_task(room_id, word_index):
    socketio.sleep(13)
    if room_id in rooms:
        room = rooms[room_id]
        if room['status'] == 'playing' and room['current_word_index'] == word_index:
            print(f"Round timer expired for room {room_id}, round {word_index}. Ending round.")
            end_round(room_id)

def end_round(room_id):
    if room_id not in rooms:
        return
        
    room = rooms[room_id]
    if room['status'] != 'playing':
        return
        
    room['status'] = 'results'
    sorted_winners = sorted(room['round_winners'], key=lambda x: x['speed'])
    results_list = []
    winner_sids = {w['sid'] for w in sorted_winners}
    
    for index, w in enumerate(sorted_winners):
        rank = index + 1
        p_sid = w['sid']
        player = room['players'][p_sid]
        
        if rank == 1:
            player['streak'] += 1
            streak_bonus = 5 if player['streak'] >= 3 else 0
            points = 10 + streak_bonus
        elif rank == 2:
            player['streak'] = 0
            points = 5
        elif rank == 3:
            player['streak'] = 0
            points = 3
        else:
            player['streak'] = 0
            points = 1
            
        player['score'] += points
        
        results_list.append({
            'name': player['name'],
            'speed': round(w['speed'], 2),
            'points_earned': points,
            'streak': player['streak'],
            'rank': rank
        })
        
    for p_sid, player in room['players'].items():
        if p_sid not in winner_sids:
            player['streak'] = 0
            player['speed_in_round'] = None
            results_list.append({
                'name': player['name'],
                'speed': None,
                'points_earned': 0,
                'streak': 0,
                'rank': None
            })
            
    results_list = sorted(results_list, key=lambda x: (x['rank'] is None, x['rank']))
    
    socketio.emit('round_completed', {
        'word': room['current_word'],
        'round_results': results_list,
        'scoreboard': get_players_list(room_id)
    }, to=room_id)
    
    socketio.start_background_task(next_round_delayed, room_id, room['current_word_index'])

def next_round_delayed(room_id, word_index):
    socketio.sleep(6)
    if room_id in rooms:
        room = rooms[room_id]
        if room['status'] == 'results' and room['current_word_index'] == word_index:
            next_round(room_id)

def next_round(room_id):
    room = rooms[room_id]
    next_idx = room['current_word_index'] + 1
    
    if next_idx >= len(room['word_list']):
        room['status'] = 'finished'
        socketio.emit('game_over', {
            'scoreboard': sorted(get_players_list(room_id), key=lambda x: x['score'], reverse=True)
        }, to=room_id)
        print(f"Game over in room {room_id}")
    else:
        room['status'] = 'playing'
        room['current_word_index'] = next_idx
        room['current_word'] = room['word_list'][next_idx]
        room['round_winners'] = []
        
        for p_sid in room['players']:
            room['players'][p_sid]['speed_in_round'] = None
            
        room['word_start_time'] = time.time()
        
        socketio.emit('new_word', {
            'word': room['current_word'],
            'index': next_idx,
            'total_rounds': len(room['word_list'])
        }, to=room_id)
        
        socketio.start_background_task(round_timer_task, room_id, next_idx)
        print(f"Room {room_id} round {next_idx} started. Word: {room['current_word']}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)
