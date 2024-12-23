const express = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multer = require("multer");
const path = require("path");
require("dotenv").config();

const app = express();

// Configuración de AWS S3
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const bucketName = process.env.BUCKET_NAME;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Configuración de Multer para manejar archivos
const upload = multer({
  storage: multer.memoryStorage(),
});

// Ruta para subir archivos a S3
app.post("/api/upload", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send("No se ha enviado ningún archivo.");
  }

  const params = {
    Bucket: bucketName,
    Key: file.originalname, // El nombre del archivo en S3
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  try {
    const command = new PutObjectCommand(params);
    await s3.send(command);

    const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.originalname}`;
    res.status(200).send({
      message: "Archivo subido con éxito.",
      url: fileUrl, // URL pública del archivo
    });
  } catch (err) {
    console.error("Error al subir el archivo a S3:", err);
    res.status(500).send("Error al subir el archivo.");
  }
});

// Ruta para servir el archivo front.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "front.html"));
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
