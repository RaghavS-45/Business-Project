import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios"; // your axios instance
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck } from "lucide-react";

const ROLES = ["ADMIN", "MANAGER", "CASHIER"] as const;
type Role = typeof ROLES[number];

const roleBadgeClass: Record<Role, string> = {
    ADMIN: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    MANAGER: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    CASHIER: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

interface User {
    _id: string;
    name: string;
    email: string;
    role: Role;
    isActive: boolean;
    lastLogin: string | null;
    createdAt: string;
}

const emptyForm = { name: "", email: "", password: "", role: "CASHIER" as Role };

export default function UsersPage() {
    const qc = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);

    const { data, isLoading } = useQuery({
        queryKey: ["users"],
        queryFn: () => api.get("/users").then((r) => r.data.data.users as User[]),
    });

    const createMutation = useMutation({
        mutationFn: (body: typeof form) => api.post("/users", body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            toast.success("User created successfully");
            setDialogOpen(false);
            setForm(emptyForm);
        },
        onError: (e: any) => toast.error(e.response?.data?.message ?? "Failed to create user"),
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ id, role }: { id: string; role: Role }) =>
            api.patch(`/users/${id}`, { role }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            toast.success("Role updated");
        },
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            api.patch(`/users/${id}`, { isActive }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => api.delete(`/users/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["users"] });
            toast.success("User deleted");
        },
        onError: (e: any) => toast.error(e.response?.data?.message ?? "Failed to delete user"),
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Team Members</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage who has access and what they can do
                    </p>
                </div>
                <Button onClick={() => setDialogOpen(true)} className="gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add User
                </Button>
            </div>

            {/* Users Table */}
            <div className="rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border/50">
                        <tr>
                            {["Name", "Email", "Role", "Status", "Last Login", ""].map((h) => (
                                <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="text-center py-12 text-muted-foreground">
                                    Loading...
                                </td>
                            </tr>
                        ) : (
                            data?.map((user) => (
                                <tr key={user._id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 font-medium text-foreground">{user.name}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                                    <td className="px-4 py-3">
                                        <Select
                                            value={user.role}
                                            onValueChange={(role) =>
                                                updateRoleMutation.mutate({ id: user._id, role: role as Role })
                                            }
                                        >
                                            <SelectTrigger className="w-32 h-7 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROLES.map((r) => (
                                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() =>
                                                toggleActiveMutation.mutate({ id: user._id, isActive: !user.isActive })
                                            }
                                        >
                                            <Badge
                                                variant="outline"
                                                className={
                                                    user.isActive
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-pointer"
                                                        : "bg-red-500/10 text-red-400 border-red-500/20 cursor-pointer"
                                                }
                                            >
                                                {user.isActive ? "Active" : "Inactive"}
                                            </Badge>
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {user.lastLogin
                                            ? new Date(user.lastLogin).toLocaleDateString()
                                            : "Never"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                                            onClick={() => deleteMutation.mutate(user._id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add User Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-indigo-400" />
                            Add Team Member
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <Input
                            placeholder="Full name"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                        <Input
                            placeholder="Email address"
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                        <Input
                            placeholder="Password (min 8 chars)"
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                        <Select
                            value={form.role}
                            onValueChange={(r) => setForm({ ...form, role: r as Role })}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                {ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => createMutation.mutate(form)}
                            disabled={createMutation.isPending}
                        >
                            {createMutation.isPending ? "Creating..." : "Create User"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}