// app.js

import express from 'express';
import { Readable } from 'stream';
import { Validator } from 'shacl-engine';
import ParserN3 from '@rdfjs/parser-n3';
import rdfDataset from '@rdfjs/dataset'; // Correct: Default import
import rdfDataModel from '@rdfjs/data-model'; // Correct: Added for the factory

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '5mb' }));

// Helper function to parse a Turtle string into an RDF/JS dataset
async function parseTurtle(turtleString) {
  const parser = new ParserN3();
  const stream = Readable.from(turtleString);
  // Correct: Use the imported default object to create a dataset
  const quads = rdfDataset.dataset(); 
  
  return new Promise((resolve, reject) => {
    parser.import(stream)
      .on('data', quad => quads.add(quad))
      .on('end', () => resolve(quads))
      .on('error', error => reject(error));
  });
}

// Simple route for health checks
app.get('/', (req, res) => {
  res.json({ message: 'SHACL validation server is running. POST to /validate.' });
});

// Validation endpoint
app.post('/validate', async (req, res) => {
  const { shapes, data } = req.body;

  if (!shapes || !data) {
    return res.status(400).json({ error: 'Request body must contain "shapes" and "data" properties as Turtle strings.' });
  }

  try {
    const shapesDataset = await parseTurtle(shapes);
    const dataDataset = await parseTurtle(data);

    // Correct: Pass the required factory option to the constructor
    const validator = new Validator(shapesDataset, { factory: rdfDataModel });
    
    // The validate method expects an object with a 'dataset' property
    const report = await validator.validate({ dataset: dataDataset });

    const results = report.results.map(result => ({
        message: result.message.map(m => m.value),
        path: result.path ? result.path.value : null,
        focusNode: result.focusNode ? result.focusNode.value : null,
        severity: result.severity ? result.severity.value : null,
        sourceConstraintComponent: result.sourceConstraintComponent ? result.sourceConstraintComponent.value : null,
        sourceShape: result.sourceShape ? result.sourceShape.value : null,
    }));

    res.json({
      conforms: report.conforms,
      results,
    });

  } catch (error) {
    console.error('Validation Error:', error);
    res.status(500).json({ error: 'An error occurred during validation.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
