import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { addJob, QUEUE_NAMES } from "../config/queue.js";

/**
 * User Service — business logic for admin user management.
 *
 * All mutations (create, update, delete) enqueue an audit log job
 * so every role change and deactivation is permanently recorded.
 */

class UserService {
    async getAllUsers() {
        return User.find().sort({ createdAt: -1 });
    }

    async createUser({ name, email, password, role }, requestingUserId = null) {
        const existing = await User.findOne({ email });
        if (existing) throw ApiError.conflict("Email is already registered");

        const user = await User.create({ name, email, password, role });
        logger.info(`User created by admin: ${email} (${role})`);

        if (requestingUserId) {
            await addJob(QUEUE_NAMES.AUDIT_LOG, "user-create", {
                action: "CREATE",
                entity: "User",
                entityId: user._id.toString(),
                userId: requestingUserId.toString(),
                before: null,
                after: { name: user.name, email: user.email, role: user.role, isActive: user.isActive },
                metadata: {},
            });
        }

        return user;
    }

    async updateUser(id, { role, isActive }, requestingUserId = null) {
        // Capture snapshot before mutation for the audit diff
        const before = await User.findById(id).lean();
        if (!before) throw ApiError.notFound("User not found");

        const user = await User.findByIdAndUpdate(
            id,
            { ...(role && { role }), ...(isActive !== undefined && { isActive }) },
            { new: true, runValidators: true }
        );

        logger.info(`User updated: ${user.email}`);

        if (requestingUserId) {
            await addJob(QUEUE_NAMES.AUDIT_LOG, "user-update", {
                action: "UPDATE",
                entity: "User",
                entityId: user._id.toString(),
                userId: requestingUserId.toString(),
                before: { name: before.name, email: before.email, role: before.role, isActive: before.isActive },
                after:  { name: user.name,   email: user.email,   role: user.role,   isActive: user.isActive },
                metadata: {},
            });
        }

        return user;
    }

    async deleteUser(id, requestingUserId) {
        if (id === requestingUserId.toString())
            throw ApiError.badRequest("Cannot delete your own account");

        const user = await User.findByIdAndDelete(id);
        if (!user) throw ApiError.notFound("User not found");
        logger.info(`User deleted: ${user.email}`);

        await addJob(QUEUE_NAMES.AUDIT_LOG, "user-delete", {
            action: "DELETE",
            entity: "User",
            entityId: user._id.toString(),
            userId: requestingUserId.toString(),
            before: { name: user.name, email: user.email, role: user.role, isActive: user.isActive },
            after: null,
            metadata: {},
        });

        return { message: "User deleted successfully" };
    }
}

export default new UserService();