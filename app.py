from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from main import Player, GameRoom
import random
import string
from gevent import monkey, sleep
monkey.patch_all()

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SECRET_KEY'] = 'something_fishy_secret!'
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, 
                   cors_allowed_origins="*",
                   async_mode='gevent',
                   ping_timeout=60,
                   ping_interval=25,
                   logger=True,
                   engineio_logger=True)

# Store active game rooms
game_rooms = {}
# Store player session mappings
player_sessions = {}

def generate_room_code():
    """Generate a unique 4-letter room code, excluding confusing letters (O, I)"""
    # Define allowed characters (uppercase letters excluding O and I)
    allowed_chars = ''.join(c for c in string.ascii_uppercase if c not in 'OI')
    
    while True:
        code = ''.join(random.choices(allowed_chars, k=4))
        if code not in game_rooms:
            return code

@app.route('/')
def index():
    """Serve the game interface"""
    return render_template('index.html')

@app.route('/create_room', methods=['POST'])
def create_room():
    """Create a new game room"""
    data = request.get_json()
    host_name = data.get('name')
    if not host_name:
        return jsonify({'error': 'Name is required'}), 400
    
    room_code = generate_room_code()
    game_room = GameRoom(room_code)
    game_rooms[room_code] = game_room
    
    return jsonify({
        'room_code': room_code,
        'message': f'Room created successfully. Share code {room_code} with other players.'
    })

@app.route('/join_room/<room_code>', methods=['POST'])
def join_game_room(room_code):
    """Join an existing game room"""
    data = request.get_json()
    player_name = data.get('name')
    
    if not player_name:
        return jsonify({'error': 'Name is required'}), 400
    
    if room_code not in game_rooms:
        return jsonify({'error': 'Room not found'}), 404
    
    game_room = game_rooms[room_code]
    if game_room.game_state['status'] != 'waiting':
        return jsonify({'error': 'Game already in progress'}), 400
    
    return jsonify({
        'message': 'Successfully joined room',
        'room_code': room_code
    })

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    emit('connected', {'message': 'Connected to server'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    if request.sid in player_sessions:
        player_id = player_sessions[request.sid]['player_id']
        room_code = player_sessions[request.sid]['room_code']
        
        if room_code in game_rooms:
            game_room = game_rooms[room_code]
            game_room.remove_player(player_id)
            leave_room(room_code)
            
            # Notify other players
            emit('player_left', {
                'player_id': player_id,
                'message': f"Player {player_sessions[request.sid]['name']} has left the game"
            }, room=room_code)
            
            # Clean up empty rooms
            if len(game_room.players) == 0:
                del game_rooms[room_code]
        
        del player_sessions[request.sid]

@socketio.on('join_game')
def handle_join_game(data):
    """Handle player joining a game"""
    room_code = data.get('room_code')
    player_name = data.get('name')
    
    if room_code not in game_rooms:
        emit('error', {'message': 'Room not found'})
        return
    
    game_room = game_rooms[room_code]
    
    # Create new player
    player_id = len(game_room.players) + 1
    player = Player(player_id, player_name)
    game_room.add_player(player)
    
    # Store session info
    player_sessions[request.sid] = {
        'player_id': player_id,
        'room_code': room_code,
        'name': player_name
    }
    
    # Join socket room
    join_room(room_code)
    
    # Send list of existing players to the new player
    for existing_player in game_room.players.values():
        if existing_player.id != player_id:  # Don't send the new player to themselves
            emit('player_joined', {
                'player': existing_player.to_dict(),
                'message': f'{existing_player.name} is in the room'
            })
    
    # Notify all players in room about the new player
    emit('player_joined', {
        'player': player.to_dict(),
        'message': f'{player_name} has joined the game'
    }, room=room_code)
    
    # Send current game state to new player
    state = game_room.get_player_state(player_id)
    state['player_id'] = player_id  # Add player's own ID to state
    emit('game_state', state)

@socketio.on('start_game')
def handle_start_game(data):
    """Handle game start request"""
    room_code = data.get('room_code')
    if room_code not in game_rooms:
        emit('error', {'message': 'Room not found'})
        return
    
    game_room = game_rooms[room_code]
    if len(game_room.players) < 3:
        emit('error', {'message': 'Need at least 3 players to start'})
        return
    
    # Start the game
    game_room.start_game()
    
    # Send initial game state to all players
    for player_id in game_room.players:
        state = game_room.get_player_state(player_id)
        state['player_id'] = player_id  # Add player's own ID to state
        emit('game_started', state, room=get_player_sid(player_id, room_code))

@socketio.on('make_guess')
def handle_guess(data):
    """Handle a player making a guess"""
    room_code = data.get('room_code')
    guessed_player_id = data.get('guessed_player_id')
    
    if room_code not in game_rooms:
        emit('error', {'message': 'Room not found'})
        return
    
    game_room = game_rooms[room_code]
    guesser_id = player_sessions[request.sid]['player_id']
    
    # Process the guess
    result = game_room.process_guess(guesser_id, guessed_player_id)
    
    if 'error' in result:
        emit('error', {'message': result['error']})
        return
    
    # Broadcast result to all players first
    emit('guess_result', result, room=room_code)
    
    # If truth-teller was guessed or all liars found, handle round end
    if result.get('round_ended', False):
        if game_room.game_state['status'] == 'finished':
            # Game is over
            final_results = game_room.get_final_results()
            emit('game_over', final_results, room=room_code)
        else:
            # Wait for 1.5 seconds to let the animation complete
            sleep(1.5)
            
            # Start new round
            game_room.start_new_round()
            
            # Get the current guesser after the new round started
            current_guesser = next(p for p in game_room.players.values() if p.is_guesser())
            
            # Send new round state to all players
            for player_id in game_room.players:
                state = game_room.get_player_state(player_id)
                state['player_id'] = player_id
                state['current_round'] = game_room.game_state['current_round']
                state['next_guesser'] = current_guesser.name
                emit('new_round', state, room=get_player_sid(player_id, room_code))
    else:
        # Just update game state for all players
        for player_id in game_room.players:
            state = game_room.get_player_state(player_id)
            state['player_id'] = player_id
            state['current_round'] = game_room.game_state['current_round']
            emit('game_state_update', state, room=get_player_sid(player_id, room_code))

@socketio.on('skip_question')
def handle_skip_question(data):
    """Handle skipping to a new question"""
    room_code = data.get('room_code')
    if room_code not in game_rooms:
        emit('error', {'message': 'Room not found'})
        return
    
    game_room = game_rooms[room_code]
    result = game_room.skip_question()
    
    # Send new question to all players
    for player_id in game_room.players:
        state = {
            'question': result['question'],
            'answer': result['answer'] if not game_room.players[player_id].is_guesser() else None
        }
        emit('question_skipped', state, room=get_player_sid(player_id, room_code))

def get_player_sid(player_id, room_code):
    """Get socket ID for a player"""
    for sid, data in player_sessions.items():
        if data['player_id'] == player_id and data['room_code'] == room_code:
            return sid
    return None

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5001, debug=True) 