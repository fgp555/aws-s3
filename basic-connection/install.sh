#!/bin/bash

# Crear o sobrescribir el archivo .env
echo "Creando archivo .env con el siguiente contenido:"
cat <<EOL > .env
AWS_ACCESS_KEY=
AWS_SECRET_KEY=
AWS_REGION=us-east-2
BUCKET_NAME=my-s3-bucket
EOL

# Mostrar el contenido del archivo .env
cat .env

# Ejecutar npm install
echo "Ejecutando npm install..."
npm install

# Preguntar al usuario si desea ejecutar `node server.js`
read -p "¿Quieres ejecutar 'node server.js'? (S/n): " ejecutar

# Asignar 'S' como predeterminado si el usuario no introduce nada
ejecutar=${ejecutar:-S}

if [[ "$ejecutar" == "s" || "$ejecutar" == "S" ]]; then
  echo "Ejecutando 'node server.js'..."
  node server.js
else
  echo "Proceso terminado. No se ejecutó 'node server.js'."
fi
