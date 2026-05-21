import authService from "../services/auth.service.js";

/**
 * Auth Controller — thin layer that handles HTTP concerns
 * (reading req, sending res) and delegates to the service.
 */
class AuthController {
  /**
   * POST /api/auth/register
   * Body: { name, email, password, role? }
   * Access: Public (or ADMIN-only in production — see route config)
   */
  async register(req, res, next) {
    try {
      const { user, accessToken, refreshToken } = await authService.register(
        req.body
      );

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          user,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   * Body: { email, password }
   * Access: Public
   */
  async login(req, res, next) {
    try {
      const { user, accessToken, refreshToken } = await authService.login(
        req.body,
        {
          userAgent: req.headers["user-agent"],
          ip: req.ip,
        }
      );

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: {
          user,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   * Body: { refreshToken }
   * Access: Public (but requires valid refresh token)
   */
  async refresh(req, res, next) {
    try {
      const { user, accessToken, refreshToken } =
        await authService.refreshAccessToken(req.body.refreshToken, {
          userAgent: req.headers["user-agent"],
          ip: req.ip,
        });

      res.status(200).json({
        success: true,
        message: "Token refreshed",
        data: {
          user,
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   * Body: { refreshToken }
   * Access: Authenticated
   */
  async logout(req, res, next) {
    try {
      const result = await authService.logout(req.body.refreshToken);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout-all
   * Access: Authenticated (logs out all sessions for the requesting user)
   */
  async logoutAll(req, res, next) {
    try {
      const result = await authService.logoutAll(req.user._id);

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   * Access: Authenticated
   * Returns the current user's profile.
   */
  async me(req, res, next) {
    try {
      res.status(200).json({
        success: true,
        data: { user: req.user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new AuthController();
