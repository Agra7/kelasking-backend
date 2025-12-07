import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import supabase from "../db.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// REGISTRATION - Only admins can register new users (handled in staff.js)

// LOGIN - Returns access token (1hin) and refresh token (7 days)
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    // Get user from database
    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("email", email)
      .single();
    
    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Compare password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    
    // Generate tokens
    // Access token expires in 60 minutes
    const accessToken = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );
    
    // Refresh token expires in 7 days (but auto-logout after 1 hour of inactivity on frontend)
    const refreshToken = jwt.sign(
      { id: user.id }, 
      process.env.REFRESH_SECRET, 
      { expiresIn: '7d' }
    );
    
    // Update refresh token in database
    await supabase
      .from("User")
      .update({ refresh_token: refreshToken })
      .eq("id", user.id);
    
    // ✅ Kirim refresh token sebagai HttpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // allow localhost in development
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        user_nama: user.user_nama,
        email: user.email,
        role: user.role,
        jabatan: user.jabatan
      }
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// REFRESH TOKEN - Get new access token using refresh token
router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    
    // Get user and verify refresh token matches
    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("id", decoded.id)
      .eq("refresh_token", refreshToken)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // Generate new access token
    const accessToken = jwt.sign(
      { id: user.id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    res.json({ accessToken });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// LOGOUT - Clear refresh token
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await supabase
      .from("User")
      .update({ refresh_token: null })
      .eq("id", req.user.id);

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// FORGOT PASSWORD - Request password reset
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Check if user exists
    const { data: user, error } = await supabase
      .from("User")
      .select("id, email, user_nama")
      .eq("email", email)
      .single();

    // Always return success even if user doesn't exist (security best practice)
    if (error || !user) {
      return res.json({ 
        message: "If an account exists with this email, a password reset link has been sent." 
      });
    }

    // Generate reset token (random 32 bytes)
    const resetToken = crypto.randomBytes(32).toString("hex");
    
    // Hash the token before storing
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Token expires in 1 hour
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    // Save hashed token to database
    await supabase
      .from("User")
      .update({ 
        reset_token: hashedToken,
        reset_token_expiry: resetTokenExpiry.toISOString()
      })
      .eq("id", user.id);


    
    res.json({ 
      message: "If an account exists with this email, a password reset link has been sent.",
      // DEVELOPMENT ONLY - Remove in production
      resetToken: resetToken,
      resetLink: `http://localhost:3000/reset-password?token=${resetToken}`
    });

    // TODO: Implement actual email sending
    // Example using nodemailer or SendGrid:
    /*
    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      html: `
        <p>Hi ${user.user_nama},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="http://yourfrontend.com/reset-password?token=${resetToken}">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
    */

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// RESET PASSWORD - Reset password using token
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Hash the provided token
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with matching token and non-expired token
    const { data: user, error } = await supabase
      .from("User")
      .select("*")
      .eq("reset_token", hashedToken)
      .single();

    if (error || !user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    // Check if token is expired
    const tokenExpiry = new Date(user.reset_token_expiry);
    if (tokenExpiry < new Date()) {
      return res.status(400).json({ error: "Reset token has expired" });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await supabase
      .from("User")
      .update({ 
        password_hash: newPasswordHash,
        reset_token: null,
        reset_token_expiry: null
      })
      .eq("id", user.id);

    res.json({ message: "Password reset successfully. You can now log in with your new password." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// CHANGE PASSWORD - Change password when logged in (requires old password)
router.put("/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  try {
    // Get user from database
    const { data: user, error: userError } = await supabase
      .from("User")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    const { error: updateError } = await supabase
      .from("User")
      .update({ password_hash: newPasswordHash })
      .eq("id", req.user.id);

    if (updateError) throw updateError;

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("User")
      .select("id, user_nama, email, role, jabatan")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Return user info (match shape your frontend expects)
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;