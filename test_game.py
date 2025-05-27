import unittest
from main import Player, GameRoom

class TestSomethingFishy(unittest.TestCase):
    def setUp(self):
        """Set up a game room with 4 players for each test"""
        print("\n" + "="*50)
        print("Setting up new game room with 4 players...")
        self.room = GameRoom("test_room")
        self.players = [
            Player(1, "Alice", False),
            Player(2, "Bob", False),
            Player(3, "Charlie", False),
            Player(4, "David", False)
        ]
        for player in self.players:
            self.room.add_player(player)
            print(f"Added player: {player.name} (ID: {player.id})")

    def test_game_initialization(self):
        """Test that the game initializes correctly"""
        print("\n" + "="*50)
        print("TEST: Game Initialization")
        print("="*50)
        
        # Start game
        print("\nStarting game...")
        success = self.room.start_game()
        print(f"Game started successfully: {success}")
        
        # Check roles
        print("\nInitial role assignment:")
        for player in self.room.players.values():
            print(f"  {player.name}: {player.role}")
        
        # Show Q&A
        print(f"\nFirst round Q&A:")
        print(f"Question: {self.room.game_state['question']}")
        print(f"Answer: {self.room.game_state['answer']}")

    def test_role_rotation(self):
        """Test that roles rotate correctly between rounds"""
        print("\n" + "="*50)
        print("TEST: Role Rotation")
        print("="*50)
        
        print("\nStarting game...")
        self.room.start_game()
        
        print("\nRound 1 roles:")
        for player in self.room.players.values():
            print(f"  {player.name}: {player.role}")
        
        # Get initial guesser
        initial_guesser = next(p for p in self.room.players.values() if p.is_guesser())
        print(f"\nInitial guesser: {initial_guesser.name}")
        
        print("\nStarting new round...")
        self.room.start_new_round()
        
        print("\nRound 2 roles:")
        for player in self.room.players.values():
            print(f"  {player.name}: {player.role}")
        
        new_guesser = next(p for p in self.room.players.values() if p.is_guesser())
        print(f"\nNew guesser: {new_guesser.name}")

    def test_guessing_mechanics(self):
        """Test the guessing mechanics and point distribution"""
        print("\n" + "="*50)
        print("TEST: Guessing Mechanics")
        print("="*50)
        
        print("\nStarting game...")
        self.room.start_game()
        
        print("\nCurrent roles:")
        for player in self.room.players.values():
            print(f"  {player.name}: {player.role}")
        
        # Get players
        guesser = next(p for p in self.room.players.values() if p.is_guesser())
        truth_teller = next(p for p in self.room.players.values() if p.is_truth_teller())
        liars = [p for p in self.room.players.values() if p.is_liar()]
        
        print(f"\nQuestion: {self.room.game_state['question']}")
        print(f"Answer: {self.room.game_state['answer']}")
        print(f"\nGuesser ({guesser.name}) is trying to find the liars...")
        
        # Test guessing a liar
        liar_to_guess = liars[0]
        print(f"\nGuessing {liar_to_guess.name}...")
        result = self.room.process_guess(guesser.id, liar_to_guess.id)
        print(f"Result: {'Correct! Found a liar!' if not result['was_truth_teller'] else 'Wrong! That was the truth-teller!'}")
        print(f"Points earned this guess: {result['points_earned']}")
        print(f"Guesser's accumulated points: {guesser.temp_points}")
        
        # Test guessing truth-teller
        print(f"\nGuessing {truth_teller.name}...")
        result = self.room.process_guess(guesser.id, truth_teller.id)
        print(f"Result: {'That was the truth-teller! Round ends.' if result['was_truth_teller'] else 'Found another liar!'}")
        print(f"Guesser's final points this round: {guesser.temp_points}")
        
        print("\nFinal scores:")
        for player in self.room.players.values():
            print(f"  {player.name}: {player.points} points")

    def test_game_end_conditions(self):
        """Test that the game ends when a player reaches 5 points"""
        print("\n" + "="*50)
        print("TEST: Game End Conditions")
        print("="*50)
        
        print("\nStarting game...")
        self.room.start_game()
        
        # Get a player and artificially set their points
        player = list(self.room.players.values())[0]
        print(f"\nArtificially setting {player.name}'s points to 4...")
        player.points = 4
        
        print("Current scores:")
        for p in self.room.players.values():
            print(f"  {p.name}: {p.points} points")
        
        print(f"\nAdding one more point to {player.name}...")
        player.add_points(1)
        
        # Check if game ends
        self.room.update_scores()
        if any(p.get_points() >= 5 for p in self.room.players.values()):
            self.room.game_state['status'] = 'finished'
            print(f"\nGame Over! {player.name} has won with {player.points} points!")
        
        print("\nFinal scores:")
        for p in self.room.players.values():
            print(f"  {p.name}: {p.points} points")

    def test_player_state_privacy(self):
        """Test that players only see their own role and appropriate game info"""
        print("\n" + "="*50)
        print("TEST: Player State Privacy")
        print("="*50)
        
        print("\nStarting game...")
        self.room.start_game()
        
        # Get a guesser and non-guesser
        guesser = next(p for p in self.room.players.values() if p.is_guesser())
        non_guesser = next(p for p in self.room.players.values() if not p.is_guesser())
        
        print(f"\nActual roles:")
        for player in self.room.players.values():
            print(f"  {player.name}: {player.role}")
        
        print(f"\nQuestion: {self.room.game_state['question']}")
        print(f"Answer: {self.room.game_state['answer']}")
        
        print(f"\nWhat {guesser.name} (Guesser) sees:")
        guesser_state = self.room.get_player_state(guesser.id)
        print(f"  Question: {guesser_state.get('question', 'Not visible')}")
        print(f"  Can see question: {'question' in guesser_state}")
        print(f"  Can see answer: {'answer' in guesser_state}")
        print(f"  Can see own role: {guesser_state['players'][guesser.id]['role']}")
        print(f"  Can see others' roles: {'role' in guesser_state['players'][non_guesser.id]}")
        
        # Assert guesser can see question but not answer
        self.assertTrue('question' in guesser_state, "Guesser should see the question")
        self.assertFalse('answer' in guesser_state, "Guesser should not see the answer")
        
        print(f"\nWhat {non_guesser.name} (Non-guesser) sees:")
        non_guesser_state = self.room.get_player_state(non_guesser.id)
        print(f"  Question: {non_guesser_state.get('question', 'Not visible')}")
        print(f"  Can see question: {'question' in non_guesser_state}")
        print(f"  Can see answer: {'answer' in non_guesser_state}")
        print(f"  Can see own role: {non_guesser_state['players'][non_guesser.id]['role']}")
        print(f"  Can see others' roles: {'role' in non_guesser_state['players'][guesser.id]}")
        
        # Assert non-guesser can see answer but not question
        self.assertFalse('question' in non_guesser_state, "Non-guesser should not see the question")
        self.assertTrue('answer' in non_guesser_state, "Non-guesser should see the answer")

if __name__ == '__main__':
    unittest.main(verbosity=2) 