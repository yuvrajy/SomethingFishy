# Something Fishy

A multiplayer deception game where players try to figure out who's telling the truth and who's lying.

## Features

- Real-time multiplayer gameplay using Socket.IO
- Beautiful, responsive UI with Tailwind CSS
- Dynamic role assignment (Guesser, Truth-teller, Liar)
- Point-based scoring system
- Game statistics and awards
- Reconnection support
- Play Again functionality

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yuvrajy/SomethingFishy.git
cd SomethingFishy
```

2. Create a virtual environment (recommended):
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows, use: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip3 install -r requirements.txt
```

## Running the Game

1. Start the server:
```bash
python3 main.py
```

2. Open your browser and navigate to:
```
http://localhost:5001
```

## Game Rules

1. Each round, players are assigned one of three roles:
   - Guesser: Try to identify who's lying
   - Truth-teller: Tell the truth but make it sound like a lie
   - Liar: Make up convincing false answers

2. The game continues until a player reaches 20 points.

3. Points are awarded for:
   - Guessers: Correctly identifying liars
   - Truth-tellers: Successfully fooling the guesser
   - Liars: Surviving without being caught

## Technologies Used

- Python Flask
- Socket.IO
- Tailwind CSS
- Material Icons
- Baloo 2 Font

## Contributing

Feel free to submit issues and enhancement requests!

## License

[MIT License](LICENSE)

## Created By

Yuvi Toovi