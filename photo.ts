import { v4 as uuidv4 } from 'uuid'
import { Schema, model, Model, Connection } from 'mongoose'
import multer from 'multer'
import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

import axios from 'axios'
import FormData from 'form-data'

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Create uploads directory if it doesn't exist
const uploadPath = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath)
}


// Configure multer
export const upload = multer({
  dest: uploadPath
})


interface AnalyzerDoc {
  _id: string
  fileName: string
  originalName: string
  uploadDate: Date
  firstName: string
  lastName: string
  photoData: Buffer
}


const schema = new Schema<AnalyzerDoc>({
  _id: { type: String, default: uuidv4 },
  fileName: { type: String, required: true },
  originalName: String,
  uploadDate: { type: Date, default: Date.now },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  photoData: { type: Buffer, required: true } // Store binary image data
})


const photo: {
  endpoint: string
  model: Model<AnalyzerDoc> | null
  init: (conn: Connection) => void
  post: any[]
  save: any[]
  get: any[]
  } = {
  endpoint: '/api/photo',
  model: null,
    

  init: conn => {
    photo.model = conn.model('photos', schema)
  },

  post: [
    upload.single('photo'),
    async (req, res) => {
      if (!req.file) {
        return res.status(400).json({ error: 'Brak przesłanego pliku' })
      }
  
      try {
        const form = new FormData()
        form.append('photo', fs.createReadStream(req.file.path), req.file.originalname)
  
        const fastApiResponse = await axios.post(
          'http://localhost:8001/analyze', // or your container/service IP
          form,
          { headers: form.getHeaders(), responseType: 'arraybuffer' }
        )
  
        const result = fastApiResponse.data

        res.setHeader('Content-Type', 'image/jpeg')
        res.send(result) // from FastAPI

        // Clean up uploaded file
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Failed to delete uploaded file:', err)
        })
  
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    }
  ],
  save: [
    upload.single('photo'),
    async (req, res) => {
      try {
        const { firstName, lastName } = req.body
  
        if (!req.file || !firstName || !lastName) {
          return res.status(400).json({ error: 'Brak wymaganych danych' })
        }
        const buffer = fs.readFileSync(req.file.path)     // ✅

        

        console.log("req.file.path  "+req.file.path)

        console.log('Saving analyzed image:', req.file?.originalname)


        // console.log("REQ ",req)
        // console.log("REQ.BODY ",req.body)    
        console.log("REQ.FILE ",req.file)
  
        const item = new photo.model!({
          fileName: req.file.filename,
          originalName: req.file.originalname,
          firstName,
          lastName,
          photoData: buffer
        })
  
        const err = item.validateSync()
        if (err) return res.status(400).json({ error: err.message })
  
        await item.save()

        // Clean up uploaded file
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Failed to delete uploaded file:', err)
        })
  
        res.json({ success: true })
      } catch (err: any) {
        res.status(500).json({ error: err.message })
      }
    }
  ],
  // Add to your `photo` object in photo.ts
  get: [
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        startDate,
        endDate,
        page = 1,
        itemsPerPage = 5,
        sortBy = 'uploadDate',
        sortDesc = 'false'
      } = req.query

      const query: any = {}
      if (firstName) query.firstName = new RegExp(firstName as string, 'i')
      if (lastName) query.lastName = new RegExp(lastName as string, 'i')
      if (startDate && endDate) {
        const from = new Date(startDate as string);
        const to = new Date(endDate as string);
        if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
          // Include the full day of the end date by setting time to end of the day
          to.setHours(23, 59, 59, 999);
          query.uploadDate = { $gte: from, $lte: to };
        }
      }

      const allowedSortFields = ['uploadDate', 'firstName', 'lastName', 'originalName'];
      const sortField = allowedSortFields.includes(sortBy as string) ? sortBy : 'uploadDate';
      const sortOrder = sortDesc === 'true' ? -1 : 1;

      const skip = (parseInt(page as string) - 1) * parseInt(itemsPerPage as string)
      const limit = parseInt(itemsPerPage as string)

      const [items, total] = await Promise.all([
        photo.model!.find(query)
          .sort({ [sortField]: sortOrder })
          .skip(skip)
          .limit(limit),
        photo.model!.countDocuments(query)
      ])

      res.json({ items, total })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  }
]

  
}
export default photo;
