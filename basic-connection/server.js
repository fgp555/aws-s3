const AWS_S3 = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const express = require("express");
const multer = require("multer");
const path = require("path");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// Configuración de AWS S3 (v3)
const s3 = new AWS_S3.S3Client({
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
app.use(morgan("dev"));

// Middleware para manejar errores globalmente
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).send({
    message: err.message || "Error interno del servidor",
  });
});

// Configuración de Multer para manejar archivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10 MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Tipo de archivo no permitido"));
    }
    cb(null, true);
  },
});

// Ruta para subir archivos a S3
app.post("/api/upload", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send("No se ha enviado ningún archivo.");
  }

  const fileKey = Date.now() + "-" + file.originalname; // Generar clave única para el archivo
  const params = {
    Bucket: bucketName,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  try {
    const command = new AWS_S3.PutObjectCommand(params);
    await s3.send(command);

    const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
    res.status(200).send({
      message: "Archivo subido con éxito.",
      url: fileUrl,
      key: fileKey,
    });
  } catch (err) {
    console.error("Error al subir el archivo a S3:", err);
    res.status(500).send("Error al subir el archivo.");
  }
});

// Ruta para listar archivos en el bucket
app.get("/api/files", async (req, res) => {
  const params = {
    Bucket: bucketName,
  };

  try {
    const command = new AWS_S3.ListObjectsCommand(params);
    const response = await s3.send(command);
    const files = response.Contents?.map((file) => ({
      key: file.Key,
      lastModified: file.LastModified,
      size: file.Size,
      url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`,
    }));

    res.status(200).json(files || []);
  } catch (err) {
    console.error("Error al listar archivos:", err);
    res.status(500).send("Error al listar archivos.");
  }
});

// Ruta para obtener un archivo por su nombre
app.get("/api/files/:filename", async (req, res) => {
  const { filename } = req.params;

  const params = {
    Bucket: bucketName,
    Key: filename,
  };

  try {
    const command = new AWS_S3.GetObjectCommand(params);
    const response = await s3.send(command);

    res.setHeader("Content-Type", response.ContentType);
    response.Body.pipe(res); // Transmite el archivo directamente al cliente
  } catch (err) {
    console.error("Error al obtener el archivo:", err);
    res.status(404).send("Archivo no encontrado.");
  }
});

// Ruta para obtener una URL firmada
app.get("/api/files/:filename/signed-url", async (req, res) => {
  const { filename } = req.params;

  const params = {
    Bucket: bucketName,
    Key: filename,
  };

  try {
    // Generar la URL firmada que expira en 1 hora
    const command = new AWS_S3.GetObjectCommand(params);
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 }); // 60 segundos = 1 hora

    res.status(200).send({
      message: "URL firmada generada con éxito.",
      url: signedUrl,
    });
  } catch (err) {
    console.error("Error al generar la URL firmada:", err);
    res.status(500).send("Error al generar la URL firmada.");
  }
});

// Ruta para actualizar (reemplazar) un archivo en S3
app.put("/api/files/:filename", upload.single("file"), async (req, res) => {
  const file = req.file;
  const { filename } = req.params;

  if (!file) {
    return res.status(400).send("No se ha enviado ningún archivo.");
  }

  const params = {
    Bucket: bucketName,
    Key: filename,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  try {
    const command = new AWS_S3.PutObjectCommand(params);
    await s3.send(command);

    const fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;
    res.status(200).send({
      message: "Archivo actualizado con éxito.",
      url: fileUrl,
      key: filename,
    });
  } catch (err) {
    console.error("Error al actualizar el archivo en S3:", err);
    res.status(500).send("Error al actualizar el archivo.");
  }
});

// Ruta para eliminar un archivo
app.delete("/api/files/:filename", async (req, res) => {
  const { filename } = req.params;

  const params = {
    Bucket: bucketName,
    Key: filename,
  };

  try {
    const command = new AWS_S3.DeleteObjectCommand(params);
    await s3.send(command);

    res.status(200).send({
      message: "Archivo eliminado con éxito.",
      key: filename,
    });
  } catch (err) {
    console.error("Error al eliminar el archivo de S3:", err);
    res.status(500).send("Error al eliminar el archivo.");
  }
});

// Ruta para eliminar múltiples archivos
app.delete("/api/files", async (req, res) => {
  const { keys } = req.body; // `keys` es un array con los nombres de los archivos

  if (!keys || !keys.length) {
    return res.status(400).send("No se han enviado claves de archivos para eliminar.");
  }

  const params = {
    Bucket: bucketName,
    Delete: {
      Objects: keys.map((key) => ({ Key: key })),
    },
  };

  try {
    const command = new AWS_S3.DeleteObjectsCommand(params);
    const response = await s3.send(command);

    res.status(200).send({
      message: "Archivos eliminados con éxito.",
      deleted: response.Deleted,
    });
  } catch (err) {
    console.error("Error al eliminar múltiples archivos:", err);
    res.status(500).send("Error al eliminar los archivos.");
  }
});

// Ruta para eliminar todos los archivos en el bucket
app.delete("/api/delete-all", async (req, res) => {
  try {
    // Obtener la lista de objetos en el bucket
    const listParams = {
      Bucket: bucketName,
    };

    const listCommand = new AWS_S3.ListObjectsV2Command(listParams);
    const data = await s3.send(listCommand);

    if (!data.Contents || data.Contents.length === 0) {
      return res.status(400).send("No hay archivos para eliminar.");
    }

    // Crear una lista de objetos para eliminar
    const deleteParams = {
      Bucket: bucketName,
      Delete: {
        Objects: data.Contents.map((object) => ({ Key: object.Key })),
      },
    };

    // Eliminar los archivos
    const deleteCommand = new AWS_S3.DeleteObjectsCommand(deleteParams);
    await s3.send(deleteCommand);

    res.status(200).send("Todos los archivos han sido eliminados con éxito.");
  } catch (err) {
    console.error("Error al eliminar todos los archivos:", err);
    res.status(500).send("Error al eliminar los archivos.");
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
