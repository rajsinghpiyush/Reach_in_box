FROM node:20-alpine

WORKDIR /app

# Install openssl for Prisma query engine on Alpine Linux
RUN apk add --no-cache openssl

# Install dependencies first for better caching
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copy source code and build
COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 5000

# Push schema to database and start server
CMD ["sh", "-c", "npx prisma db push && npm start"]
