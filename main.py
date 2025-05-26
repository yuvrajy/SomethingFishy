import random

def getnewQA():
    with open('questions.txt', 'r') as file:
        # Read all lines and remove empty ones
        lines = [line.strip() for line in file.readlines() if line.strip()]
        # Pick a random line
        qa_line = random.choice(lines)
        # Split by semicolon into question and answer
        question, answer = qa_line.split(';')
        return question.strip(), answer.strip()

class Player:
    def __init__(self, id, name, is_guesser=False):
        self.id = id
        self.name = name
        self.points = 0
        self.role = "guesser" if is_guesser else "liar"  # can be "guesser", "truth-teller", or "liar"
        self.has_been_guessed = False
        self.temp_points = 0
        # Stats tracking
        self.times_as_guesser = 0
        self.times_as_truth_teller = 0
        self.times_as_liar = 0
        self.correct_guesses = 0
        self.total_guesses = 0
        self.times_caught_as_liar = 0
        self.times_survived_as_liar = 0
        self.rounds_played = 0

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

    def get_information(self, info):
        print(f"{self.name} has gotten information: {info} and is a {self.role}")

    def is_guesser(self):
        return self.role == "guesser"

    def is_truth_teller(self):
        return self.role == "truth-teller"

    def is_liar(self):
        return self.role == "liar"

    def reset_round(self):
        self.has_been_guessed = False
        self.temp_points = 0

    def prompt_lies(self, players):
        while True:
            # Count unguessed players at the start of each turn
            unguessed_players = [p for p in players if not p.has_been_guessed and p != self]
            remaining_count = len(unguessed_players)
            
            # If only one player remains, it must be the truth-teller
            if remaining_count == 1 and unguessed_players[0].is_truth_teller():
                print(f"\nOnly one player remains - it must be the truth-teller ({unguessed_players[0].get_name()})!")
                print("You found all the liars! You get an extra point as bonus!")
                self.add_points(self.temp_points + 1)
                self.correct_guesses += 1
                self.total_guesses += 1
                self.temp_points = 0
                break
            
            print(f"\nThere are {remaining_count} unguessed players remaining.")
            guess = input(f"{self.name} please guess a liar or end your turn (type 'end' to end turn): ").strip()
            
            if guess.lower() == 'end':
                if remaining_count == 1 and unguessed_players[0].is_truth_teller():
                    print(f"You found all the liars! The last player {unguessed_players[0].get_name()} was telling the truth!")
                    self.add_points(self.temp_points)
                    self.correct_guesses += 1
                else:
                    print(f"Turn ended. You get {self.temp_points} points from your correct guesses.")
                    self.add_points(self.temp_points)
                self.temp_points = 0
                break
                
            # Find the guessed player
            guessed_player = None
            for player in players:
                if player.get_name().lower() == guess.lower():
                    guessed_player = player
                    break
                    
            if not guessed_player:
                print("Invalid player name. Try again.")
                continue
                
            if guessed_player == self:
                print("You cannot guess yourself! Try again.")
                continue
                
            if guessed_player.has_been_guessed:
                print("This player has already been guessed. Try again.")
                continue
                
            guessed_player.has_been_guessed = True
            
            if guessed_player.is_truth_teller():
                # Guessed a truth-teller - lose all temp points
                print(f"{guessed_player.get_name()} was telling the truth! You lose your points.")
                # Give truth-teller a point if they're not the last one
                if remaining_count > 1:
                    print(f"{guessed_player.get_name()} gets a point for being caught!")
                    guessed_player.add_points(1)
                self.temp_points = 0
                self.total_guesses += 1
                break
            else:
                # Guessed a liar - accumulate a point
                print(f"Correct! {guessed_player.get_name()} was lying!")
                self.temp_points += 1
                self.correct_guesses += 1
                self.total_guesses += 1
                guessed_player.times_caught_as_liar += 1
        
        # After turn ends, give points to any unguessed liars
        for player in players:
            if not player.has_been_guessed and player.is_liar() and player != self:
                print(f"{player.get_name()} was an unguessed liar and gets a point!")
                player.add_points(1)
                player.times_survived_as_liar += 1

def SwapRound():
    global playerlist
    # Find current guesser and their index
    current_guesser_index = 0
    for i, player in enumerate(playerlist):
        if player.is_guesser():
            current_guesser_index = i
            player.role = "liar"  # Reset to liar by default
            break
    
    # Set next player as guesser
    next_guesser_index = (current_guesser_index + 1) % len(playerlist)
    playerlist[next_guesser_index].role = "guesser"
    playerlist[next_guesser_index].times_as_guesser += 1
    
    # Reset all non-guessers to liars
    for player in playerlist:
        if not player.is_guesser():
            player.role = "liar"
            player.rounds_played += 1
    
    # Pick random non-guesser to be truth-teller
    non_guessers = [p for p in playerlist if not p.is_guesser()]
    truth_teller = random.choice(non_guessers)
    truth_teller.role = "truth-teller"
    truth_teller.times_as_truth_teller += 1
    
    # Update liar count for remaining players
    for player in non_guessers:
        if player.is_liar():
            player.times_as_liar += 1
    
    print(f"\nNew round! {playerlist[next_guesser_index].get_name()} is the guesser.")

player1 = Player(1, "John", False)
player2 = Player(2, "Jane", False)
player3 = Player(3, "Jim", False)
player4 = Player(4, "Jill", False)
player5 = Player(5, "Jack", True)  # Start with player5 as guesser so player1 will be first after SwapRound
playerlist = [player1, player2, player3, player4, player5]

# Set initial truth-teller
non_guessers = [p for p in playerlist if not p.is_guesser()]
truth_teller = random.choice(non_guessers)
truth_teller.role = "truth-teller"

print(f"Setting up the game...")
SwapRound()  # This will make player1 the first guesser

print(f"Game starting! {player1.get_name()} is the first guesser.")

def get_player_rank_score(player):
    # Calculate ranking score based on tiebreakers
    accuracy = (player.correct_guesses / player.total_guesses * 100) if player.total_guesses > 0 else 0
    survival_rate = (player.times_survived_as_liar / player.times_as_liar * 100) if player.times_as_liar > 0 else 0
    
    # Combine scores with weights
    return (
        player.points,  # Primary sort by points
        accuracy,       # First tiebreaker: guessing accuracy
        survival_rate,  # Second tiebreaker: survival rate as liar
        random.random() # Final tiebreaker: random chance (for fun!)
    )

def get_random_tiebreaker_joke():
    jokes = [
        "Flipped a virtual coin, but it landed on its edge... had to flip again!",
        "Asked a quantum computer, but it said 'yes' AND 'no'...",
        "Rock, Paper, Scissors... but they all picked Rock!",
        "Consulted the ancient art of 'Eeny, Meeny, Miny, Moe'",
        "Drew straws, but they were all the same length!",
        "Asked ChatGPT, but it wrote a poem instead...",
        "Rolled a D20, but it bounced under the fridge!",
    ]
    return random.choice(jokes)

def end_game():
    print("\n" + "="*50)
    print("🎮 GAME OVER! Final Statistics 📊")
    print("="*50)
    
    # Sort players by our ranking system
    sorted_players = sorted(playerlist, key=get_player_rank_score, reverse=True)
    
    # Find players tied for first
    max_points = sorted_players[0].points
    tied_players = [p for p in sorted_players if p.points == max_points]
    
    # Announce winner(s) with tiebreaker explanation
    print("\n👑 WINNER ANNOUNCEMENT:")
    print("-"*20)
    if len(tied_players) > 1:
        print(f"We had a {len(tied_players)}-way tie at {max_points} points!")
        print("After considering tiebreakers...")
        print(f"1. Guessing Accuracy")
        print(f"2. Survival Rate as Liar")
        print(f"3. {get_random_tiebreaker_joke()}")
        print(f"\n🏆 The WINNER is... {sorted_players[0].name}! 🎉")
    else:
        print(f"🏆 Congratulations to {sorted_players[0].name} with {max_points} points! 🎉")
    
    print("\n🏆 FINAL RANKINGS:")
    print("-"*20)
    for i, player in enumerate(sorted_players, 1):
        accuracy = (player.correct_guesses / player.total_guesses * 100) if player.total_guesses > 0 else 0
        survival = (player.times_survived_as_liar / player.times_as_liar * 100) if player.times_as_liar > 0 else 0
        print(f"{i}. {player.name}: {player.points} points")
        print(f"   Accuracy: {accuracy:.1f}% | Survival Rate: {survival:.1f}%")
    
    print("\n📊 PLAYER STATISTICS:")
    print("-"*20)
    for player in playerlist:
        print(f"\n👤 {player.name}'s Stats:")
        print(f"  • Rounds Played: {player.rounds_played}")
        print(f"  • Times as Guesser: {player.times_as_guesser}")
        print(f"  • Times as Truth-teller: {player.times_as_truth_teller}")
        print(f"  • Times as Liar: {player.times_as_liar}")
        
        # Calculate percentages
        guess_accuracy = (player.correct_guesses / player.total_guesses * 100) if player.total_guesses > 0 else 0
        survival_rate = (player.times_survived_as_liar / player.times_as_liar * 100) if player.times_as_liar > 0 else 0
        caught_rate = (player.times_caught_as_liar / player.times_as_liar * 100) if player.times_as_liar > 0 else 0
        
        print(f"  • Guessing Accuracy: {guess_accuracy:.1f}%")
        print(f"  • Liar Survival Rate: {survival_rate:.1f}%")
        print(f"  • Times Caught Rate: {caught_rate:.1f}%")
    
    print("\n🎯 GAME SUMMARY:")
    print("-"*20)
    total_rounds = max(p.rounds_played for p in playerlist)
    total_correct_guesses = sum(p.correct_guesses for p in playerlist)
    total_guesses = sum(p.total_guesses for p in playerlist)
    overall_accuracy = (total_correct_guesses / total_guesses * 100) if total_guesses > 0 else 0
    
    print(f"Total Rounds Played: {total_rounds}")
    print(f"Total Correct Guesses: {total_correct_guesses}")
    print(f"Overall Guessing Accuracy: {overall_accuracy:.1f}%")
    
    # Find some interesting superlatives
    best_guesser = max(playerlist, key=lambda p: p.correct_guesses if p.total_guesses > 0 else -1)
    best_survivor = max(playerlist, key=lambda p: p.times_survived_as_liar if p.times_as_liar > 0 else -1)
    
    print("\n🏅 AWARDS:")
    print("-"*20)
    print(f"Best Guesser: {best_guesser.name} ({best_guesser.correct_guesses} correct guesses)")
    print(f"Best Liar: {best_survivor.name} ({best_survivor.times_survived_as_liar} successful escapes)")
    
    print("\n" + "="*50)

def is_running():
    for player in playerlist:
        if player.get_points() >= 5:  # Changed to >= to ensure we don't go past the winning condition
            return False
    return True

while(is_running()):
    question, answer = getnewQA()
    SwapRound()
    
    # Reset all players' round state
    for player in playerlist:
        player.reset_round()
    
    # Give information to players
    for player in playerlist:
        if player.is_guesser():
            player.get_information(question)
        else:
            player.get_information(answer)
    print("everyone has gotten information")
    
    # Let the guesser take their turn
    for player in playerlist:
        if player.is_guesser():
            player.prompt_lies(playerlist)
            break
    
    # Display current scores
    print("\nCurrent scores:")
    for player in playerlist:
        print(f"{player.get_name()}: {player.get_points()} points")
    print("\n")

# Call end_game when the game is finished
end_game()

    

    




   
