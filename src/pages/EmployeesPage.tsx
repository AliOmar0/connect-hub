import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/layout/DashboardLayout";
import EmployeeCard from "@/components/employees/EmployeeCard";
import { supabase } from "@/integrations/supabase/client";
import { Employee, Profile, ChannelType } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Plus, Users, Star, Upload, Camera } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { AppRole } from "@/types/database";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function EmployeesPage() {
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const canManage =
    userRole === "admin" || userRole === "supervisor" || userRole === "manager";

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, profile:profiles(*)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching employees:", error);
        return [];
      }

      return (data || []) as Array<Employee & { profile?: Profile }>;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .order("first_name");

      return (data || []) as Profile[];
    },
    enabled: canManage && isDialogOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (employeeData: Partial<Employee>) => {
      const { data, error } = await supabase
        .from("employees")
        .insert(employeeData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee created successfully");
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create employee");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Employee>) => {
      const { error } = await supabase
        .from("employees")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated successfully");
      setIsDialogOpen(false);
      setEditingEmployee(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update employee");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete employee");
    },
  });

  const filteredEmployees = employees?.filter((emp) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const name = emp.profile
      ? `${emp.profile.first_name || ""} ${emp.profile.last_name || ""}`.toLowerCase()
      : "";
    return (
      name.includes(term) ||
      emp.employee_code?.toLowerCase().includes(term) ||
      emp.department?.toLowerCase().includes(term)
    );
  });

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsDialogOpen(true);
  };

  const handleDelete = (employee: Employee) => {
    if (confirm(`Are you sure you want to delete this employee?`)) {
      deleteMutation.mutate(employee.id);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-display font-bold tracking-tight text-primary">
              Employee Management
            </h1>
            <p className="text-muted-foreground">
              Manage your team, roles, and individual permissions.
            </p>
          </div>
          {canManage && (
            <div className="flex gap-3">
              <CreateUserDialog />
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-primary/20 hover:bg-primary/5"
                  >
                    <Plus className="h-4 w-4 mr-2 text-primary" />
                    Add Employee
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <EmployeeForm
                    employee={editingEmployee}
                    profiles={profiles || []}
                    onSubmit={(data) => {
                      if (editingEmployee) {
                        updateMutation.mutate({
                          id: editingEmployee.id,
                          ...data,
                        });
                      } else {
                        createMutation.mutate(data);
                      }
                    }}
                    onCancel={() => {
                      setIsDialogOpen(false);
                      setEditingEmployee(null);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Team Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Total Team
                </p>
                <h4 className="text-2xl font-bold text-primary">
                  {employees?.length || 0}
                </h4>
              </div>
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-500/5 border-green-500/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Active Now
                </p>
                <h4 className="text-2xl font-bold text-green-600">
                  {employees?.filter((e) => e.is_active).length || 0}
                </h4>
              </div>
              <div className="h-10 w-10 bg-green-500/10 rounded-xl flex items-center justify-center text-green-600">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-500/5 border-yellow-500/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Avg Performance
                </p>
                <h4 className="text-2xl font-bold text-yellow-600">
                  {employees && employees.length > 0
                    ? (
                        (employees.reduce(
                          (acc, curr) => acc + (curr.performance_score || 0),
                          0,
                        ) /
                          employees.length) *
                        100
                      ).toFixed(0)
                    : 0}
                  %
                </h4>
              </div>
              <div className="h-10 w-10 bg-yellow-500/10 rounded-xl flex items-center justify-center text-yellow-600">
                <Star className="h-5 w-5 fill-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-500/5 border-blue-500/10 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                  Active Depts
                </p>
                <h4 className="text-2xl font-bold text-blue-600">
                  {new Set(employees?.map((e) => e.department).filter(Boolean))
                    .size || 0}
                </h4>
              </div>
              <div className="h-10 w-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-600">
                <Users className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="border-none shadow-none bg-transparent">
          <CardContent className="p-0">
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search employees by name, code, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-14 bg-card border-border/40 shadow-sm text-lg focus-visible:ring-primary/20 rounded-2xl"
              />
            </div>
          </CardContent>
        </Card>

        {/* Employees Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="h-64 animate-pulse" />
            ))}
          </div>
        ) : filteredEmployees && filteredEmployees.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((employee) => (
              <EmployeeCard
                key={employee.id}
                employee={employee}
                onEdit={canManage ? handleEdit : undefined}
                onDelete={canManage ? handleDelete : undefined}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No employees found</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function EmployeeForm({
  employee,
  profiles,
  onSubmit,
  onCancel,
}: {
  employee?: Employee | null;
  profiles: Profile[];
  onSubmit: (data: Partial<Employee>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    profile_id: employee?.profile_id || "",
    employee_code: employee?.employee_code || "",
    department: employee?.department || "",
    shift_start: employee?.shift_start || "",
    shift_end: employee?.shift_end || "",
    assigned_channels: (employee?.assigned_channels || []) as ChannelType[],
    is_active: employee?.is_active ?? true,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(
    employee?.profile?.avatar_url || "",
  );
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const channels: ChannelType[] = [
    "whatsapp",
    "messenger",
    "sms",
    "voice",
    "email",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);

    try {
      let avatar_url = previewUrl;

      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const filePath = `${formData.profile_id}/${Math.random()}.${fileExt}`;

        const { error: uploadError, data } = await supabase.storage
          .from("avatars")
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(filePath);

        avatar_url = publicUrl;

        // Update the profile with the new avatar_url
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ avatar_url })
          .eq("id", formData.profile_id);

        if (profileError) throw profileError;
      }

      onSubmit(formData);
    } catch (error) {
      toast.error("Failed to upload image");
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const toggleChannel = (channel: ChannelType) => {
    setFormData((prev) => ({
      ...prev,
      assigned_channels: prev.assigned_channels.includes(channel)
        ? prev.assigned_channels.filter((c) => c !== channel)
        : [...prev.assigned_channels, channel],
    }));
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{employee ? "Edit Employee" : "Add Employee"}</DialogTitle>
        <DialogDescription>
          {employee
            ? "Update employee information and settings."
            : "Create a new employee record and link it to a user profile."}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col items-center gap-4 py-4 bg-muted/30 rounded-2xl border border-dashed border-border/60">
          <div className="relative group">
            <Avatar className="h-24 w-24 ring-4 ring-background shadow-md">
              <AvatarImage src={previewUrl} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                {employee?.profile?.first_name?.charAt(0) || (
                  <Camera className="h-8 w-8 opacity-40" />
                )}
              </AvatarFallback>
            </Avatar>
            <Label
              htmlFor="avatar-upload"
              className="absolute inset-0 flex items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <Upload className="h-6 w-6" />
            </Label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold">Employee Photo</p>
            <p className="text-xs text-muted-foreground">
              Click to upload or drag and drop
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile_id">User Profile</Label>
          <Select
            value={formData.profile_id}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, profile_id: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a user profile" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.first_name} {profile.last_name} ({profile.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="employee_code">Employee Code</Label>
          <Input
            id="employee_code"
            value={formData.employee_code}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                employee_code: e.target.value,
              }))
            }
            placeholder="EMP001"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            value={formData.department}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, department: e.target.value }))
            }
            placeholder="Customer Service"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="shift_start">Shift Start</Label>
            <Input
              id="shift_start"
              type="time"
              value={formData.shift_start}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  shift_start: e.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift_end">Shift End</Label>
            <Input
              id="shift_end"
              type="time"
              value={formData.shift_end}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, shift_end: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Assigned Channels</Label>
          <div className="grid grid-cols-2 gap-2">
            {channels.map((channel) => (
              <div key={channel} className="flex items-center space-x-2">
                <Checkbox
                  id={channel}
                  checked={formData.assigned_channels.includes(channel)}
                  onCheckedChange={() => toggleChannel(channel)}
                />
                <Label
                  htmlFor={channel}
                  className="text-sm font-normal capitalize cursor-pointer"
                >
                  {channel}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_active"
            checked={formData.is_active}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({
                ...prev,
                is_active: checked as boolean,
              }))
            }
          />
          <Label
            htmlFor="is_active"
            className="text-sm font-normal cursor-pointer"
          >
            Active
          </Label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </form>
    </>
  );
}

function CreateUserDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    first_name: "",
    last_name: "",
    role: "agent" as AppRole,
    phone: "",
    department: "",
  });

  const roles: AppRole[] = [
    "admin",
    "supervisor",
    "manager",
    "agent",
    "viewer",
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      // Get the session token
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast.error("You must be logged in to create users");
        setIsLoading(false);
        return;
      }

      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
          phone: formData.phone || null,
          department: formData.department || null,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success(
        `User ${formData.email} created successfully with role ${formData.role}`,
      );
      setIsOpen(false);
      setFormData({
        email: "",
        password: "",
        confirmPassword: "",
        first_name: "",
        last_name: "",
        role: "agent",
        phone: "",
        department: "",
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to create user";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Create a new user account with email, password, and assign their
            role and permissions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    first_name: e.target.value,
                  }))
                }
                placeholder="John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    last_name: e.target.value,
                  }))
                }
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="user@example.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role *</Label>
            <Select
              value={formData.role}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, role: value as AppRole }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, phone: e.target.value }))
                }
                placeholder="+962791234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    department: e.target.value,
                  }))
                }
                placeholder="Support"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create User"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
