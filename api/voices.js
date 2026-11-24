import { handleApiRequest } from '../app.mjs';

export default function handler(req, res) {
  return handleApiRequest(req, res, '/api/voices');
}
