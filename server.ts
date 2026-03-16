import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }

  // Configure Multer for file uploads
  const upload = multer({ dest: "uploads/" });

  // API Routes
  app.post("/api/convert-image", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const { format, quality } = req.body;
      const targetFormat = format || "jpeg";
      const targetQuality = parseInt(quality) || 80;

      const outputFileName = `${req.file.filename}.${targetFormat}`;
      const outputPath = path.join("uploads/", outputFileName);

      let processor = sharp(req.file.path);

      if (targetFormat === "jpeg" || targetFormat === "jpg") {
        processor = processor.jpeg({ quality: targetQuality });
      } else if (targetFormat === "png") {
        processor = processor.png({ quality: targetQuality });
      } else if (targetFormat === "webp") {
        processor = processor.webp({ quality: targetQuality });
      }

      await processor.toFile(outputPath);

      res.download(outputPath, `converted-image.${targetFormat}`, (err) => {
        // Cleanup
        if (req.file) fs.unlinkSync(req.file.path);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      });
    } catch (error) {
      console.error("Image conversion error:", error);
      res.status(500).json({ error: "Failed to convert image" });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
