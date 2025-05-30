import random
from flask_socketio import emit

class Player:
    def __init__(self, id, name, is_guesser=False):
        self.id = id
        self.name = name
        self.points = 0
        self.role = "guesser" if is_guesser else "liar"
        self.temp_points = 0  # Points accumulated during current round
        self.has_been_guessed = False
        # Stats tracking
        self.times_as_guesser = 0
        self.times_as_truth_teller = 0
        self.times_as_liar = 0
        self.correct_guesses = 0
        self.total_guesses = 0
        self.times_caught_as_liar = 0
        self.times_survived_as_liar = 0
        self.rounds_played = 0
        # Disconnection tracking
        self.is_disconnected = False
        self.disconnect_time = None

    def __str__(self):
        return f"Player(id={self.id}, name={self.name}, points={self.points})"

    def add_points(self, points):
        self.points += points

    def get_points(self):
        return self.points 

    def get_id(self):
        return self.id

    def get_name(self):
        return self.name

    def get_role(self):
        return self.role

    def is_guesser(self):
        return self.role == "guesser"

    def is_truth_teller(self):
        return self.role == "truth-teller"

    def is_liar(self):
        return self.role == "liar"

    def reset_round(self):
        self.has_been_guessed = False
        self.temp_points = 0

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'points': self.points,
            'role': self.role,
            'has_been_guessed': self.has_been_guessed,
            'is_disconnected': self.is_disconnected,
            'disconnect_time': self.disconnect_time
        }

class GameRoom:
    def __init__(self, room_code):
        self.room_code = room_code
        self.players = {}
        self.used_questions = set()  # Track used questions
        self.game_state = {
            'status': 'waiting',  # waiting, playing, finished
            'current_round': 0,
            'current_guesser': None,
            'truth_teller': None,
            'question': None,
            'answer': None,
            'guessed_players': [],
            'scores': {}
        }
    
    def add_player(self, player):
        """Add a player to the room"""
        self.players[player.id] = player
        self.game_state['scores'][player.id] = 0
    
    def remove_player(self, player_id):
        """Remove a player from the room"""
        if player_id in self.players:
            del self.players[player_id]
            del self.game_state['scores'][player_id]
    
    def start_game(self):
        """Initialize and start the game"""
        if len(self.players) >= 3:
            self.game_state['status'] = 'playing'
            # Make the last player the initial guesser so first player becomes guesser after swap
            player_ids = list(self.players.keys())
            self.players[player_ids[-1]].role = "guesser"
            
            # Set initial truth-teller
            non_guessers = [p for p in self.players.values() if not p.is_guesser()]
            truth_teller = random.choice(non_guessers)
            truth_teller.role = "truth-teller"
            
            self.start_new_round()
            return True
        return False
    
    def start_new_round(self):
        """Initialize a new round"""
        self.game_state['current_round'] += 1
        
        # Get new question and answer for the round
        question, answer = self.get_new_qa()
        self.game_state['question'] = question
        self.game_state['answer'] = answer
        
        # Reset all players' round state
        for player in self.players.values():
            player.reset_round()
        
        # Swap roles
        self.swap_round()
        
        # Update game state
        self.game_state['guessed_players'] = []
        current_guesser = next(p for p in self.players.values() if p.is_guesser())
        self.game_state['current_guesser'] = current_guesser.id
        truth_teller = next(p for p in self.players.values() if p.is_truth_teller())
        self.game_state['truth_teller'] = truth_teller.id
    
    def swap_round(self):
        """Swap roles for the next round"""
        player_ids = list(self.players.keys())
        # Find current guesser and their index
        current_guesser = next(p for p in self.players.values() if p.is_guesser())
        current_index = player_ids.index(current_guesser.id)
        
        # Reset current guesser to liar
        current_guesser.role = "liar"
        
        # Set next player as guesser
        next_index = (current_index + 1) % len(player_ids)
        next_guesser = self.players[player_ids[next_index]]
        next_guesser.role = "guesser"
        next_guesser.times_as_guesser += 1
        
        # Reset all non-guessers to liars
        for player in self.players.values():
            if not player.is_guesser():
                player.role = "liar"
                player.rounds_played += 1
        
        # Pick random non-guesser to be truth-teller
        non_guessers = [p for p in self.players.values() if not p.is_guesser()]
        truth_teller = random.choice(non_guessers)
        truth_teller.role = "truth-teller"
        truth_teller.times_as_truth_teller += 1
        
        # Update liar count for remaining players
        for player in non_guessers:
            if player.is_liar():
                player.times_as_liar += 1
    
    def process_guess(self, guesser_id, guessed_player_id):
        """Process a guess from the guesser"""
        if self.game_state['status'] != 'playing':
            return {'error': 'Game is not in progress'}
            
        guesser = self.players[guesser_id]
        guessed_player = self.players[guessed_player_id]
        
        if not guesser.is_guesser():
            return {'error': 'Not your turn to guess'}
            
        if guessed_player.has_been_guessed:
            return {'error': 'Player has already been guessed'}
            
        if guesser_id == guessed_player_id:
            return {'error': 'Cannot guess yourself'}
        
        # Mark player as guessed
        guessed_player.has_been_guessed = True
        self.game_state['guessed_players'].append(guessed_player_id)
        
        # Count remaining unguessed players
        unguessed_players = [p for p in self.players.values() 
                           if not p.has_been_guessed and p.id != guesser_id]
        remaining_count = len(unguessed_players)
        
        result = {
            'guessed_player': guessed_player.name,
            'was_truth_teller': guessed_player.is_truth_teller(),
            'remaining_players': remaining_count,
            'points_earned': 0,
            'round_ended': False
        }
        
        if guessed_player.is_truth_teller():
            # Guessed truth-teller - lose points
            guesser.temp_points = 0
            guesser.total_guesses += 1
            # Give truth-teller a point if they're not the last one guessed
            if remaining_count >= 0:  # Changed from >= 1 to >= 0 to include second-to-last
                guessed_player.add_points(1)
                result['truth_teller_point'] = True
            result['round_ended'] = True
            
            # Start new round since guessing truth-teller ends the round
            next_guesser = self.get_next_guesser()
            result['next_guesser'] = next_guesser.name
            self.end_round()
        else:
            # Guessed a liar correctly
            guesser.temp_points += 1
            guesser.correct_guesses += 1
            guesser.total_guesses += 1
            guessed_player.times_caught_as_liar += 1
            result['points_earned'] = 1
            
            # Check if only truth-teller remains
            if remaining_count == 1 and unguessed_players[0].is_truth_teller():
                guesser.add_points(guesser.temp_points + 1)  # Bonus point
                result['points_earned'] = guesser.temp_points + 1
                result['round_ended'] = True
                result['found_all_liars'] = True
                # Start new round since all liars found
                self.end_round()
        
        # Update scores in game state
        self.update_scores()
        
        return result
    
    def end_round(self):
        """End the current round and handle point distribution"""
        guesser = next(p for p in self.players.values() if p.is_guesser())
        
        # Add accumulated points to guesser
        guesser.add_points(guesser.temp_points)
        
        # Give points to unguessed liars
        for player in self.players.values():
            if not player.has_been_guessed and player.is_liar() and player.id != guesser.id:
                player.add_points(1)
                player.times_survived_as_liar += 1
        
        # Update scores and check if game is over
        self.update_scores()
        if any(p.get_points() >= 20 for p in self.players.values()):
            self.game_state['status'] = 'finished'
            return self.get_final_results()
        
        # Start new round
        self.start_new_round()
        return None
    
    def get_new_qa(self):
        """Get a new question-answer pair, ensuring no repeats in the same game"""
        with open('questions.txt', 'r', encoding='utf-8') as file:
            # Read all lines and remove empty ones
            lines = [line.strip() for line in file.readlines() if line.strip()]
            
            # Filter out previously used questions
            available_lines = [line for line in lines if line not in self.used_questions]
            
            # If we've used all questions, reset the used questions set
            if not available_lines:
                self.used_questions.clear()
                available_lines = lines
            
            # Pick a random line
            qa_line = random.choice(available_lines)
            self.used_questions.add(qa_line)  # Mark as used
            
            # Split by semicolon into question and answer
            question, answer = qa_line.split(';')
            return question.strip(), answer.strip()
    
    def update_scores(self):
        """Update scores in game state"""
        for player_id, player in self.players.items():
            self.game_state['scores'][player_id] = player.get_points()
    
    def get_final_results(self):
        """Get final game results with rankings and stats"""
        sorted_players = sorted(self.players.values(), 
                              key=lambda p: (p.points, 
                                           p.correct_guesses / p.total_guesses if p.total_guesses > 0 else 0,
                                           p.times_survived_as_liar / p.times_as_liar if p.times_as_liar > 0 else 0,
                                           random.random()),
                              reverse=True)
        
        results = {
            'winner': sorted_players[0].name,
            'rankings': [],
            'stats': {},
            'awards': {}
        }
        
        # Add rankings with stats
        for i, player in enumerate(sorted_players, 1):
            accuracy = (player.correct_guesses / player.total_guesses * 100) if player.total_guesses > 0 else 0
            survival = (player.times_survived_as_liar / player.times_as_liar * 100) if player.times_as_liar > 0 else 0
            
            results['rankings'].append({
                'rank': i,
                'name': player.name,
                'points': player.points,
                'accuracy': accuracy,
                'survival_rate': survival
            })
            
            # Add detailed stats
            results['stats'][player.id] = {
                'rounds_played': player.rounds_played,
                'times_as_guesser': player.times_as_guesser,
                'times_as_truth_teller': player.times_as_truth_teller,
                'times_as_liar': player.times_as_liar,
                'correct_guesses': player.correct_guesses,
                'total_guesses': player.total_guesses,
                'times_caught': player.times_caught_as_liar,
                'times_survived': player.times_survived_as_liar
            }
        
        # Add awards
        best_guesser = max(self.players.values(), 
                          key=lambda p: p.correct_guesses if p.total_guesses > 0 else -1)
        best_survivor = max(self.players.values(), 
                          key=lambda p: p.times_survived_as_liar if p.times_as_liar > 0 else -1)
        
        results['awards'] = {
            'best_guesser': {
                'name': best_guesser.name,
                'correct_guesses': best_guesser.correct_guesses
            },
            'best_liar': {
                'name': best_survivor.name,
                'successful_escapes': best_survivor.times_survived_as_liar
            }
        }
        
        return results
    
    def get_player_state(self, player_id):
        """Get game state from a specific player's perspective"""
        state = self.game_state.copy()
        player = self.players[player_id]
        
        # Remove question and answer from state first
        if 'answer' in state:
            del state['answer']
        if 'question' in state:
            del state['question']
        
        # Only guesser sees the question
        if player.is_guesser():
            state['question'] = self.game_state['question']
        
        # Only non-guessers see the answer
        if not player.is_guesser():
            state['answer'] = self.game_state['answer']
        
        # Everyone sees basic player info
        state['players'] = {
            pid: {
                'id': p.id,
                'name': p.name,
                'points': p.points,
                'has_been_guessed': p.has_been_guessed,
                'is_disconnected': getattr(p, 'is_disconnected', False)
            } for pid, p in self.players.items()
        }
        
        # Add the player's own role
        state['players'][player_id]['role'] = player.role
        
        return state 
    
    def skip_question(self):
        """Skip the current question and get a new one"""
        question, answer = self.get_new_qa()
        self.game_state['question'] = question
        self.game_state['answer'] = answer
        return {
            'question': question,
            'answer': answer
        }
    
    def get_next_guesser(self):
        """Get the player who will be the next guesser"""
        player_ids = list(self.players.keys())
        current_guesser = next(p for p in self.players.values() if p.is_guesser())
        current_index = player_ids.index(current_guesser.id)
        next_index = (current_index + 1) % len(player_ids)
        return self.players[player_ids[next_index]]
    
    def reset_for_restart(self):
        """Reset the room state but keep players"""
        self.game_state = {
            'status': 'waiting',
            'current_round': 0,
            'current_guesser': None,
            'truth_teller': None,
            'question': None,
            'answer': None,
            'guessed_players': [],
            'scores': {}
        }
        for player in self.players.values():
            player.reset_round()

def handle_restart_game(data):
    room_code = data['room_code']
    if room_code not in rooms:
        return
    
    room = rooms[room_code]
    
    # Notify all players that game is restarting
    emit('game_restarting', room=room_code)
    
    # Reset room state but keep players
    room.reset_for_restart()
    
    # Notify all players that game has restarted
    for player_id in room.players:
        player = room.players[player_id]
        emit('player_rejoined', {
            'player': {
                'id': player_id,
                'name': player.name
            }
        }, room=room_code)
    
    emit('game_restarted', room=room_code)
    
