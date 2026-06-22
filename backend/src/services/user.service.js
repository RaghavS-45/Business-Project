import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

class UserService {
    async getAllUsers() {
        return User.find().sort({ createdAt: -1 });
    }

    async createUser({ name, email, password, role }) {
        const existing = await User.findOne({ email });
        if (existing) throw ApiError.conflict("Email is already registered");
        const user = await User.create({ name, email, password, role });
        logger.info(`User created by admin: ${email} (${role})`);
        return user;
    }

    async updateUser(id, { role, isActive }) {
        const user = await User.findByIdAndUpdate(
            id,
            { ...(role && { role }), ...(isActive !== undefined && { isActive }) },
            { new: true, runValidators: true }
        );
        if (!user) throw ApiError.notFound("User not found");
        logger.info(`User updated: ${user.email}`);
        return user;
    }

    async deleteUser(id, requestingUserId) {
        if (id === requestingUserId.toString())
            throw ApiError.badRequest("Cannot delete your own account");
        const user = await User.findByIdAndDelete(id);
        if (!user) throw ApiError.notFound("User not found");
        logger.info(`User deleted: ${user.email}`);
        return { message: "User deleted successfully" };
    }
}

export default new UserService();