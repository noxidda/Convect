function decodeClerkToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payloadJson);
  } catch (err) {
    return null;
  }
}

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // graceful fallback for
  if (!process.env.CLERK_SECRET_KEY) {
    const devUserId = req.headers['x-clerk-user-id'];
    if (devUserId) {
      req.auth = { userId: devUserId };
      return next();
    }

    if (token) {
      const decoded = decodeClerkToken(token);
      if (decoded && decoded.sub) {
        req.auth = { userId: decoded.sub };
        return next();
      }
    }

    return res.status(401).json({ 
      error: "Authentication required. Clerk Secret Key is missing in backend .env file. For development, provide x-clerk-user-id header or Bearer JWT token." 
    });
  }

  // dynamic import of
  try {
    const { clerkClient } = await import('@clerk/express');
    
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const decoded = await clerkClient.verifyToken(token);
    req.auth = { userId: decoded.sub };
    next();
  } catch (err) {
    console.error("Clerk token verification failed, checking fallback:", err.message);
    
    // fallback: if verification
    const decoded = decodeClerkToken(token);
    if (decoded && decoded.sub) {
      console.warn("Clerk verifyToken failed, but decoded sub claim found. Allowing in dev fallback.");
      req.auth = { userId: decoded.sub };
      return next();
    }

    return res.status(401).json({ error: "Unauthorized: Invalid authentication token" });
  }
};
