import userService from "../services/user.service.js";

class UserController {
    async getAll(req, res, next) {
        try {
            const users = await userService.getAllUsers();
            res.json({ success: true, data: { users } });
        } catch (e) { next(e); }
    }

    async create(req, res, next) {
        try {
            const user = await userService.createUser(req.body);
            res.status(201).json({ success: true, data: { user } });
        } catch (e) { next(e); }
    }

    async update(req, res, next) {
        try {
            const user = await userService.updateUser(req.params.id, req.body);
            res.json({ success: true, data: { user } });
        } catch (e) { next(e); }
    }

    async remove(req, res, next) {
        try {
            const result = await userService.deleteUser(req.params.id, req.user._id);
            res.json({ success: true, ...result });
        } catch (e) { next(e); }
    }
}

export default new UserController();