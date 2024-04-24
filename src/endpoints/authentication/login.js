/**
 * @swagger
 * /login:
 *   post:
 *     tags: ['Portfolio']
 *     summary: Logs in a user
 *     description: Logs in a user with the provided email and password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 description: User's password
 *             required:
 *               - email
 *               - password
 *     parameters:
 *       - in: body
 *         name: email
 *         description: User's email address
 *         required: true
 *         schema:
 *           type: string
 *           format: email   
 *       - in: body
 *         name: password
 *         description: User's password
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Logged in successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Message indicating successful login
 *                 UserName:
 *                   type: string
 *                   description: User's name
 *                 userId:
 *                   type: integer
 *                   description: User's ID
 *                 email:
 *                   type: string
 *                   format: email
 *                   description: User's email address
 *                 sessionId:
 *                   type: string
 *                   description: Session ID
 *                 Organization:
 *                   type: string
 *                   description: Organization name
 *                 Role_ID:
 *                   type: integer
 *                   description: User's role ID
 *       '400':
 *         description: Invalid request or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message
 *       '401':
 *         description: Invalid password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../../utils/pool');
const { emailRegex } = require('../../utils/Objects');
const bodyParser = require('body-parser');
const {successMessages} = require('../../utils/successMessages');
const {errorMessages} = require('../../utils/errorMessages');

const app = express();
app.use(bodyParser.json());



router.post('/', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if email and password are provided
        if (!email || !password) {
            return res.status(400).json({ error: errorMessages.MISSING_CREDENTIALS });
        }

        // Validate email format
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: errorMessages.INVALID_EMAIL });
        }

        // Retrieve user information from the database including organization name
        const [rows] = await pool.query(`
            SELECT u.*, o.org_name AS OrganizationName, r.role AS roleName
            FROM users u
            LEFT JOIN organization o ON u.Org_ID = o.org_ID
            LEFT JOIN role r ON u.Role_ID = r.role_ID
            WHERE Email = ?`, [email]);

        // Check if the user exists
        if (rows.length > 0) {
            const user = rows[0];
            const isValidPassword = await bcrypt.compare(password, user.PasswordHash);
            const isActive = user.isActive;

            if (isActive === 0) {
                return res.status(400).json({ error: errorMessages.INACTIVE_USER });
            }

            if (isValidPassword) {
                // Generate session details
                const sessionId = req.sessionID;
                const role = user.roleName;
                const userId = user.UserID;
                const UserName = user.UserName;
                const Organization = user.OrganizationName;
                const Role_ID = user.Role_ID;
                const Org_ID = user.Org_ID;
                const createdAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const expiration = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
                await pool.query('UPDATE users SET CurrentSessionID = ?, LastLoginTime = ? WHERE Email = ?', [sessionId, createdAt, email]);

                // Set session cookie
                res.cookie('sessionId', sessionId, {
                    httpOnly: true,
                    secure: false,
                    maxAge: 10 * 60 * 1000
                });

                // Respond with user information and session details
                return res.status(200).json({
                    message: successMessages.LOGGED_IN,
                    UserName: UserName,
                    userId: userId,
                    email: email,
                    sessionId: sessionId,
                    Organization: Organization,
                    Role_ID: Role_ID,
                    Org_ID: Org_ID,
                    role: role
                });
            } else {
                // Invalid password
                return res.status(401).json({ error: errorMessages.INVALID_CREDENTIALS });
            }
        } else {
            // User not found
            return res.status(400).json({ error: errorMessages.INVALID_CREDENTIALS });
        }
    } catch (error) {
        console.error("Error logging in user:", error);
        return res.status(500).json({ error: errorMessages.USER_NOT_REGISTERED });
    }
});

module.exports = router;