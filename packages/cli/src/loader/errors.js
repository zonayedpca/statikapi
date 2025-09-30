export class LoaderError extends Error {
  constructor(file, message) {
    super(`[module:${file}] ${message}`);
    this.name = 'LoaderError';
    this.file = file;
  }
}

export class SerializationError extends Error {
  constructor(message, atPath) {
    super(`${message}${atPath ? ` at ${atPath}` : ''}`);
    this.name = 'SerializationError';
    this.atPath = atPath || '$';
  }
}
