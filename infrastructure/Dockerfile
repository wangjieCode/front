FROM node:20-alpine

# Install pnpm (using v10 as requested)
RUN npm install -g pnpm@10

# Set working directory
WORKDIR /app

# Copy package files and .npmrc
# We execute pnpm install to generate a fresh lockfile based on package.json
COPY package.json .npmrc ./

# Install dependencies
# Using --no-frozen-lockfile because we are not copying the lockfile
RUN pnpm install --no-frozen-lockfile

# Copy the rest of the application code
COPY . .

# Expose the default Umi port
EXPOSE 8001

# Disable MFSU AD to prevent timeouts
ENV MFSU_AD=none

# Increase Node memory limit
ENV NODE_OPTIONS="--max_old_space_size=4096"

# Start the application
CMD ["npm", "run", "dev"]
