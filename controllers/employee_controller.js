const db = require("../DB/db");
const bcrypt = require('bcrypt');

const getRoles = async (req, res) => {
    try {
        const [roles] = await db.query('SELECT role_id, name FROM role');
        return res.status(200).json(roles);
    } catch (error) {
        console.error('Error fetching roles:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getUserByEmployeeId = async (req, res) => {
    try {
        const { id } = req.params;
        const [user] = await db.query(
            `SELECT
                u.user_id, u.username, u.role_id, e.email
                FROM user u
                JOIN employees e ON u.email = e.email
                WHERE u.is_active = 1
            `,
            [id]
        );
        if (user.length === 0) {
            return res.status(200).json(null);
        }
        return res.status(200).json(user[0]);
    } catch (error) {
        console.error('Error fetching user by employee ID:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const createEmployee = async (req, res) => {
    try {
        const { name, email, address, phone, hire_date, role_id, username, password } = req.body;

        // Validate required fields
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }
        if ((username || password) && (!username || !password)) {
            return res.status(400).json({ success: false, message: 'Both username and password are required if one is provided' });
        }
        if ((username && password) && !role_id) {
            return res.status(400).json({ success: false, message: 'Role is required when creating user credentials' });
        }

        // Check if employee already exists by email
        const [existingEmployee] = await db.query(
            'SELECT * FROM employees WHERE email = ? AND is_active = 1', 
            [email]
        );

        if (existingEmployee.length > 0) {
            return res.status(400).json({ success: false, message: 'Employee with this email already exists' });
        }

        // Check if user already exists by email or username, only if credentials are provided
        if (username && password) {
            const [existingUser] = await db.query(
                'SELECT * FROM user WHERE email = ? OR username = ? AND is_active = 1',
                [email, username]
            );

            if (existingUser.length > 0) {
                return res.status(400).json({ success: false, message: 'User with this email or username already exists' });
            }
        }

        // Insert new employee
        const [employeeResult] = await db.query(
            'INSERT INTO employees (name, email, address, phone, hire_date, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email || null, address || null, phone || null, hire_date || null, true]
        );

        const employeeData = {
            id: employeeResult.insertId,
            name,
            email: email || null,
            address: address || null,
            phone: phone || null,
            hire_date: hire_date || null,
            is_active: true,
            created_at: new Date()
        };

        // Insert corresponding user only if credentials are provided
        if (username && password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await db.query(
                'INSERT INTO user (role_id, full_name, username, email, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?)',
                [ role_id, name, username, email || null, hashedPassword, true]
            );
        }

        return res.status(201).json({ 
            success: true, 
            message: 'Employee created successfully', 
            employee: employeeData
        });

    } catch (error) {
        console.error('Error creating employee:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getEmployees = async (req, res) => {
    try {
        const [employees] = await db.query('SELECT * FROM employees WHERE is_active = 1 ORDER BY created_at DESC');
        return res.status(200).json(employees);
    } catch (error) {
        console.error('Error fetching employees:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, address, hire_date, is_active, username, password, role_id } = req.body;

        // Validate required fields
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }
        if ((username || password) && (!username || !password)) {
            return res.status(400).json({ success: false, message: 'Both username and password are required if one is provided' });
        }
        if ((username && password) && !role_id) {
            return res.status(400).json({ success: false, message: 'Role is required when updating user credentials' });
        }

        // Check if employee exists
        const [existingEmployee] = await db.query(
            'SELECT * FROM employees WHERE id = ? AND is_active = 1', 
            [id]
        );

        if (existingEmployee.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // Check for email uniqueness in employees table (check all records, not just active)
        if (email) {
            const [emailCheck] = await db.query(
                'SELECT * FROM employees WHERE email = ? AND id != ?', 
                [email, id]
            );
            if (emailCheck.length > 0) {
                return res.status(400).json({ success: false, message: 'Email already in use by another employee' });
            }
        }

        // Check if user already exists for this employee
        const [currentUser] = await db.query(
            'SELECT * FROM user WHERE user_id = ?',
            [id]
        );
        const userExists = currentUser.length > 0;

        // Check for user uniqueness of email/username if email or credentials provided
        if (email || (username && password)) {
            // For email uniqueness in user table
            if (email) {
                const [emailUserCheck] = await db.query(
                    'SELECT * FROM user WHERE email = ? AND user_id != ?',
                    [email, id]
                );
                if (emailUserCheck.length > 0) {
                    return res.status(400).json({ success: false, message: 'Email already in use by another user' });
                }
            }

            // For username uniqueness in user table
            if (username) {
                const [usernameCheck] = await db.query(
                    'SELECT * FROM user WHERE username = ? AND user_id != ?',
                    [username, id]
                );
                if (usernameCheck.length > 0) {
                    return res.status(400).json({ success: false, message: 'Username already in use by another user' });
                }
            }
        }

        // Update employee
        await db.query(
            'UPDATE employees SET name = ?, email = ?, address = ?, phone = ?, hire_date = ?, is_active = ? WHERE id = ?',
            [name, email || null, address || null, phone || null, hire_date || null, is_active !== undefined ? is_active : existingEmployee[0].is_active, id]
        );

        // Update or create user if credentials provided
        if (username && password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            if (userExists) {
                await db.query(
                    'UPDATE user SET role_id = ?, full_name = ?, username = ?, email = ?, password_hash = ?, is_active = ? WHERE user_id = ?',
                    [role_id, name, username, email || null, hashedPassword, is_active !== undefined ? is_active : true, id]
                );
            } else {
                await db.query(
                    'INSERT INTO user (user_id, role_id, full_name, username, email, password_hash, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [id, role_id, name, username, email || null, hashedPassword, is_active !== undefined ? is_active : true]
                );
            }
        } else if (userExists && (email || role_id !== undefined)) {
            // Update user details without changing password if user exists and email or role_id is provided
            await db.query(
                'UPDATE user SET full_name = ?, email = ?, role_id = ?, is_active = ? WHERE user_id = ?',
                [name, email || null, role_id || currentUser[0].role_id, is_active !== undefined ? is_active : true, id]
            );
        }

        const employeeData = {
            id: parseInt(id),
            name,
            email: email || null,
            address: address || null,
            phone: phone || null,
            hire_date: hire_date || null,
            is_active: is_active !== undefined ? is_active : existingEmployee[0].is_active,
            created_at: existingEmployee[0].created_at
        };

        return res.status(200).json({ 
            success: true, 
            message: 'Employee updated successfully',
            employee: employeeData
        });

    } catch (error) {
        console.error('Error updating employee:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if employee exists
        const [existingEmployee] = await db.query(
            'SELECT * FROM employees WHERE id = ? AND is_active = 1', 
            [id]
        );

        if (existingEmployee.length === 0) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // Deactivate employee
        await db.query('DELETE FROM employees WHERE id = ?', [id]);

        // Deactivate associated user if exists
        const [existingUser] = await db.query(
            'SELECT * FROM user WHERE user_id = ? AND is_active = 1',
            [id]
        );

        if (existingUser.length > 0) {
            await db.query('DELETE FROM user WHERE user_id = ?', [id]);
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Employee deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting employee:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = { 
    createEmployee,
    getEmployees,
    updateEmployee,
    deleteEmployee,
    getRoles,
    getUserByEmployeeId
};