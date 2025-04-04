# CommanderHut-backend

Welcome to the backend of the Magic: The Gathering AI project! This project is designed to help users generate Magic: The Gathering decks and queries related to the game using a powerful AI system. The backend is built using Node.js, MySQL, and Sequelize to provide a smooth and responsive experience for querying and managing MTG cards and deck information.

## Technologies Used

- **Node.js**: JavaScript runtime used to build the server and handle API requests.
- **MySQL**: Relational database management system to store Magic: The Gathering cards, deck data, and user information.
- **Sequelize**: ORM (Object-Relational Mapping) for Node.js to interact with MySQL easily and manage data models.

## Features

- **Deck Generation**: Generate decks based on user inputs.
- **Card Database**: Store detailed information about all Magic: The Gathering cards, including names, types, colors, and more.
- **Legalities and Rulings**: Implement legalities and rulings for each card in the database.
- **Fuzzy Card Name Matching**: Search for cards using fuzzy matching to handle minor spelling variations and errors.
- **User Data**: Store and manage user preferences and deck data.

## Setup Instructions

Follow these steps to get the backend up and running on your local machine:

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/mtg-ai-backend.git
cd mtg-ai-backend
