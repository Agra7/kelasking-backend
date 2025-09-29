import jwt from "jsonwebtoken";

function authMiddleware(req, res, next) {
  // Expect "Authorization: Bearer <token>" header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1]; // get the <token> part
  if (!token) {
    return res.status(401).json({ error: "Token missing" });
  }

  try {
    // Verify token using secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach decoded payload (id, role, etc.) to req.user
    req.user = decoded;

    // Continue to the actual route
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

export default authMiddleware;
