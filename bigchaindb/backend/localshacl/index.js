const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello, World! This is a simple Express server.' });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});