// app.js

import express from 'express';
import { Readable } from 'stream';
import fs from 'fs/promises';
import path from 'path';
import { Validator } from 'shacl-engine';
import ParserN3 from '@rdfjs/parser-n3';
import rdfDataset from '@rdfjs/dataset';
import rdfDataModel from '@rdfjs/data-model';

const app = express();
const port = process.env.PORT || 3000;
const shapesCache = new Map();

// Middleware to parse JSON bodies
app.use(express.json({ limit: '5mb' }));

// Helper function to parse a Turtle string into an RDF/JS dataset
async function parseTurtle(turtleString) {
  const parser = new ParserN3();
  const stream = Readable.from(turtleString);
  const quads = rdfDataset.dataset(); 
  
  return new Promise((resolve, reject) => {
    parser.import(stream)
      .on('data', quad => quads.add(quad))
      .on('end', () => resolve(quads))
      .on('error', error => reject(error));
  });
}

/**
 * Loads all .ttl files from the './shapes' directory into memory.
 */
async function loadShapes() {
    const shapesDir = path.resolve('shapes');
    console.log(`Looking for shapes in: ${shapesDir}`);
    try {
        const files = await fs.readdir(shapesDir);
        const turtleFiles = files.filter(file => file.endsWith('.ttl'));

        if (turtleFiles.length === 0) {
            console.warn('No .ttl files found in the shapes directory.');
            return;
        }

        for (const file of turtleFiles) {
            const shapeType = path.basename(file, '.ttl');
            const filePath = path.join(shapesDir, file);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const shapeDataset = await parseTurtle(fileContent);
            shapesCache.set(shapeType, shapeDataset);
            console.log(`-> Loaded shape: ${shapeType}`);
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Error: The './shapes' directory was not found. Please create it.`);
        } else {
            console.error('Error loading shapes:', error);
        }
        process.exit(1);
    }
}

// Simple route for health checks
app.get('/', (req, res) => {
  res.json({ 
      message: 'SHACL validation server is running. POST to /validate.',
      loaded_shapes: [...shapesCache.keys()]
  });
});

// Validation endpoint
app.post('/validate', async (req, res) => {
  const { shapeType, data } = req.body;

  if (!shapeType || !data) {
    return res.status(400).json({ error: 'Request body must contain "shapeType" and "data" properties.' });
  }

  const shapesDataset = shapesCache.get(shapeType);

  if (!shapesDataset) {
      return res.status(404).json({ 
          error: `Shape type "${shapeType}" not found.`,
          available_shapes: [...shapesCache.keys()]
      });
  }

  try {
    const dataDataset = await parseTurtle(data);
    const validator = new Validator(shapesDataset, { factory: rdfDataModel });
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

/**
 * Main function to start the server after loading shapes.
 */
async function startServer() {
    await loadShapes();
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
      console.log(`Available shapes: ${[...shapesCache.keys()].join(', ') || 'None'}`);
    });
}

startServer();
