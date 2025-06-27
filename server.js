const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors'); // ✅ ADD THIS
const path = require('path');
const app = express();
const PORT = 3000;

app.use(cors()); // ✅ ENABLE CORS
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')))

// MySQL connection setup
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'e_casino'
});

db.connect(err => {
  if (err) {
    console.error('MySQL Connection Failed:', err);
    return;
  }
  console.log('MySQL Connected');
});

// Register endpoint
app.post('/register', async (req, res) => {
  try {
    const { fullname, email, username, password } = req.body;
    console.log('Received registration:', req.body); // Log input

    if (!fullname || !email || !username || !password) {
      console.log('Missing fields');
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email],
      async (err, results) => {
        if (err) {
          console.error('DB error during SELECT:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        if (results.length > 0) {
          console.log('Duplicate username/email');
          return res.status(400).json({ error: 'Username or email already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.query(
          'INSERT INTO users (fullname, email, username, password, balance) VALUES (?, ?, ?, ?, 0)', // initialize balance = 0
          [fullname, email, username, hashedPassword],
          (err, result) => {
            if (err) {
              console.error('DB error during INSERT:', err);
              return res.status(500).json({ error: 'Failed to register user' });
            }

            console.log('User registered successfully:', result.insertId);
            res.status(201).json({ message: 'User registered successfully' });
          }
        );
      }
    );
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login endpoint
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', username);

  if (!username || !password) {
    return res.status(400).json({ error: 'Please enter username and password' });
  }

  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('DB error during login:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    console.log('Login successful for:', username);

    // Include role in response
    res.status(200).json({ 
      message: 'Login successful', 
      userId: user.id,
      role: user.role  // <-- add this line
    });
  });
});


// Deposit endpoint with balance update
app.post('/api/deposit', (req, res) => {
  const { user_id, payment_method, amount, payment_details } = req.body;

  if (!user_id || !payment_method || !amount || !payment_details) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const paymentDetailsString = JSON.stringify(payment_details);

  const query = `INSERT INTO deposits (user_id, payment_method, amount, payment_details) VALUES (?, ?, ?, ?)`;
  db.query(query, [user_id, payment_method, amount, paymentDetailsString], (err, result) => {
    if (err) {
      console.error('DB error during deposit INSERT:', err);
      return res.status(500).json({ error: 'Failed to save deposit' });
    }

    // Update users.balance by adding deposit amount
    const updateBalanceQuery = `UPDATE users SET balance = balance + ? WHERE id = ?`;
    db.query(updateBalanceQuery, [amount, user_id], (err2) => {
      if (err2) {
        console.error('DB error updating user balance:', err2);
        return res.status(500).json({ error: 'Failed to update balance' });
      }
      res.json({ success: true, depositId: result.insertId });
    });
  });
});

// Withdrawal endpoint with balance update
app.post('/api/withdraw', (req, res) => {
  const { user_id, amount, withdrawal_method, details } = req.body;

  if (!user_id || !amount || !withdrawal_method || !details) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const detailsString = JSON.stringify(details);

  const insertQuery = `INSERT INTO withdrawals (user_id, amount, withdrawal_method, details) VALUES (?, ?, ?, ?)`;
  db.query(insertQuery, [user_id, amount, withdrawal_method, detailsString], (err, result) => {
    if (err) {
      console.error('DB error during withdrawal INSERT:', err);
      return res.status(500).json({ error: 'Failed to save withdrawal' });
    }

    // Subtract withdrawal amount from users.balance
    const updateBalanceQuery = `UPDATE users SET balance = balance - ? WHERE id = ?`;
    db.query(updateBalanceQuery, [amount, user_id], (err2) => {
      if (err2) {
        console.error('DB error updating user balance:', err2);
        return res.status(500).json({ error: 'Failed to update balance' });
      }
      res.json({ success: true, withdrawalId: result.insertId });
    });
  });
});

// Get deposits by userId
app.get('/api/deposits/:userId', (req, res) => {
  const userId = req.params.userId;

  const query = 'SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC';
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('DB error fetching deposits:', err);
      return res.status(500).json({ error: 'Failed to fetch deposits' });
    }
    res.json(results);
  });
});

// Get withdrawals by userId
app.get('/api/withdrawals/:userId', (req, res) => {
  const userId = req.params.userId;

  const query = 'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC';
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('DB error fetching withdrawals:', err);
      return res.status(500).json({ error: 'Failed to fetch withdrawals' });
    }
    res.json(results);
  });
});

// Get game history by userId
app.get('/api/game-history/:userId', (req, res) => {
  const userId = req.params.userId;

  const query = `
    SELECT game_name, result, amount_won, amount_lost, date
    FROM game_history
    WHERE user_id = ?
    ORDER BY date DESC
  `;
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('DB error fetching game history:', err);
      return res.status(500).json({ error: 'Failed to fetch game history' });
    }
    res.json(results);
  });
});

app.post('/api/game-result', (req, res) => {
  const { user_id, game_name, result, amount_won, amount_lost } = req.body;

  if (!user_id || !game_name || !result || amount_won == null || amount_lost == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const queryInsert = `
    INSERT INTO game_history (user_id, game_name, result, amount_won, amount_lost, date)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;

  db.query(queryInsert, [user_id, game_name, result, amount_won, amount_lost], (err, resultInsert) => {
    if (err) {
      console.error('DB error inserting game result:', err);
      return res.status(500).json({ error: 'Failed to save game result' });
    }

    // Calculate balance change: amount_won - amount_lost
    const balanceChange = amount_won - amount_lost;

    const updateBalanceQuery = `UPDATE users SET balance = balance + ? WHERE id = ?`;
    db.query(updateBalanceQuery, [balanceChange, user_id], (err2) => {
      if (err2) {
        console.error('DB error updating user balance:', err2);
        return res.status(500).json({ error: 'Failed to update balance' });
      }

      res.json({ success: true, insertId: resultInsert.insertId });
    });
  });
});


// Simple balance fetch from users table

app.get('/api/balance/:userId', (req, res) => {
  const userId = req.params.userId;

  const query = 'SELECT balance FROM users WHERE id = ?';
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('DB error fetching balance:', err);
      return res.status(500).json({ error: 'Failed to fetch balance' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ balance: results[0].balance });
  });
});

// POST /api/reports - create new report
app.post('/api/reports', (req, res) => {
  const { reported_by, report_type, description, report_date } = req.body;

  if (!reported_by || !report_type || !description || !report_date) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const sql = 'INSERT INTO reports (reported_by, report_type, description, report_date) VALUES (?, ?, ?, ?)';
  db.query(sql, [reported_by, report_type, description, report_date], (err, results) => {
    if (err) {
      console.error('Error inserting report:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Report submitted successfully', reportId: results.insertId });
  });
});

// Get the total users (for admin)
app.get('/api/total-users', (req, res) => {
  const query = 'SELECT COUNT(*) AS total_users FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching total users:', err);  
      return res.status(500).json({ error: 'Database error', details: err.message });
    }
    console.log('Total users query result:', results);
    res.json(results[0]);
  });
});

// GET all users (for admin)
app.get('/api/users', (req, res) => {
  const query = 'SELECT id, username, email, balance FROM users';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching users:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});


// GET all withdrawals (for admin)
app.get('/api/withdrawals', (req, res) => {
  const query = `
    SELECT 
      w.id,
      u.username,        
      w.amount,
      w.created_at,
      w.status
    FROM withdrawals w
    JOIN users u ON w.user_id = u.id
    ORDER BY w.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching withdrawals:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results);
  });
});

// GET /api/deposit-history 
app.get('/api/deposit-history', (req, res) => {
  const query = `
    SELECT 
      d.id AS transaction_id, 
      u.username AS user, 
      d.amount, 
      d.created_at AS date, 
      d.payment_method AS method
    FROM deposits d
    JOIN users u ON d.user_id = u.id
    ORDER BY d.created_at DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('Query error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.json(results);
  });
});

app.get('/api/game-history', (req, res) => {
  const query = `
    SELECT 
      u.username AS user,
      g.game_name AS game,
      g.result AS outcome,
      g.date
    FROM game_history g
    JOIN users u ON g.user_id = u.id
    ORDER BY g.date DESC
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching game history:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.json(results);
  });
});

// Report History API
app.get('/api/report-history', (req, res) => {
  const query = `
    SELECT 
      id AS report_id, 
      reported_by, 
      report_type AS type, 
      description, 
      report_date AS date 
    FROM reports 
    ORDER BY report_date DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching report history:', err);
      return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }

    // ✅ FIX: wrap results in an object with "success" and "reports"
    res.json({ success: true, reports: results });
  });
});


// DELETE report by ID
app.delete('/api/delete-report/:id', (req, res) => {
  const reportId = req.params.id;

  const query = "DELETE FROM reports WHERE id = ?";
  db.query(query, [reportId], (err, result) => {
    if (err) {
      console.error("Error deleting report:", err);
      return res.status(500).json({ message: "Failed to delete report." });
    }

    console.log("Delete result:", result); // 🔍 log this

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Report not found." });
    }

    res.json({ message: "Report deleted successfully." });
  });
});

// BACKEND FOR CRYPTO WEBSITE

app.post('/api/crypto-login', (req, res) => {
  const { username, password } = req.body;

  const sql = `SELECT * FROM crypto_users WHERE username = ?`;
  db.query(sql, [username], async (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });

    if (results.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    res.json({
  message: 'Login successful',
  role: user.role,
  username: user.username,
  user_id: user.id // or user.user_id, depending on your column name
});

  });
});

app.post('/api/crypto-register', async (req, res) => {
  const { username, password, email, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = `INSERT INTO crypto_users (username, password, email, role)
               VALUES (?, ?, ?, ?)`;

  db.query(sql, [username, hashedPassword, email, role || 'user'], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Username already exists' });
      }
      return res.status(500).json({ message: 'Database error', error: err });
    }

    res.status(201).json({ message: 'User registered successfully' });
  });
});

app.post('/api/crypto-deposits', (req, res) => {
  const { user_id, amount, method, identifier } = req.body;
  const insertQuery = `
    INSERT INTO crypto_deposits (user_id, amount, method, identifier)
    VALUES (?, ?, ?, ?)
  `;
  const updateBalance = `
    UPDATE crypto_users SET balance = balance + ? WHERE id = ?
  `;

  db.query(insertQuery, [user_id, amount, method, identifier], (err) => {
    if (err) return res.status(500).json({ message: 'Insert failed' });

    db.query(updateBalance, [amount, user_id], (err2) => {
      if (err2) return res.status(500).json({ message: 'Balance update failed' });
      res.json({ message: 'Deposit successful' });
    });
  });
});


app.get('/api/crypto-deposits/:user_id', (req, res) => {
  const { user_id } = req.params;

  const query = `
    SELECT amount, method, identifier, created_at AS date
    FROM crypto_deposits
    WHERE user_id = ?
    ORDER BY created_at DESC

  `;

  db.query(query, [user_id], (err, results) => {
    if (err) {
      console.error('Error fetching deposits:', err);
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(results);
  });
});

app.get('/api/crypto-balance/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const sql = `SELECT balance FROM crypto_users WHERE id = ?`;

  db.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length === 0) return res.status(404).json({ message: 'User not found' });

    res.json({ balance: results[0].balance });
  });
});

app.post('/api/crypto-withdraw', (req, res) => {
  const { user_id, amount, method, identifier } = req.body;

  if (!user_id || !amount || !method || !identifier) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const checkBalanceQuery = `SELECT balance FROM crypto_users WHERE id = ?`;
  db.query(checkBalanceQuery, [user_id], (err, result) => {
    if (err) return res.status(500).json({ message: 'DB Error' });
    if (!result.length || result[0].balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const insertQuery = `INSERT INTO crypto_withdrawals (user_id, amount, method, identifier) VALUES (?, ?, ?, ?)`;
    db.query(insertQuery, [user_id, amount, method, identifier], (err) => {
      if (err) return res.status(500).json({ message: 'Insert failed' });

      const updateBalanceQuery = `UPDATE crypto_users SET balance = balance - ? WHERE id = ?`;
      db.query(updateBalanceQuery, [amount, user_id], (err) => {
        if (err) return res.status(500).json({ message: 'Balance update failed' });
        res.json({ message: "Withdrawal successful" });
      });
    });
  });
});

app.get('/api/crypto-withdrawals/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const query = `
    SELECT amount, method, identifier, created_at
    FROM crypto_withdrawals
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ message: "Error fetching history" });
    res.json(results);
  });
});



// POST: Save coin tap game progress
app.post('/api/crypto-coinbalance', (req, res) => {
  const { user_id, coin_balance, upgrade_level } = req.body;
  const sql = `UPDATE crypto_users SET coin_balance = ?, upgrade_level = ? WHERE id = ?`;
  db.query(sql, [coin_balance, upgrade_level, user_id], (err, result) => {
    if (err) {
      console.error("SQL UPDATE error:", err);  // 👈 Show actual error here
      return res.status(500).json({ error: 'Database error(see server console)' });
    }
    res.json({ message: 'Balance updated' });
  });
});


// GET: Load coin tap game progress
app.get('/api/crypto-coinbalance/:user_id', (req, res) => {
  const { user_id } = req.params;
  const sql = `SELECT coin_balance, upgrade_level FROM crypto_users WHERE id = ?`;
  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("SQL SELECT error:", err);  // 👈 Force logging the error
      return res.status(500).json({ error: 'Database error(see server console)' });
    }
    if (result.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result[0]);
  });
});

app.post('/api/crypto-tokenbalance', (req, res) => {
  const { user_id, amount } = req.body;

  if (typeof user_id === 'undefined' || typeof amount === 'undefined') {
    return res.status(400).json({ error: 'Missing user_id or amount' });
  }

  const sql = `UPDATE crypto_users SET token_balance = token_balance + ? WHERE id = ?`;

  db.query(sql, [amount, user_id], (err, result) => {
    if (err) {
      console.error('Token balance update error:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Token balance updated successfully' });
  });
});

app.get('/api/crypto-tokenbalance/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const sql = `SELECT token_balance FROM crypto_users WHERE id = ?`;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("SQL error:", err);
      return res.status(500).json({ message: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ token_balance: results[0].token_balance });
  });
});


// Convert Coin to Token
app.post('/api/convert-coin-to-token', (req, res) => {
  const { user_id, coin_amount } = req.body;
  const sql = 'SELECT coin_balance, token_balance FROM crypto_users WHERE id = ?';

  db.query(sql, [user_id], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ error: 'User not found' });

    const { coin_balance, token_balance } = results[0];
    if (coin_balance < coin_amount) return res.status(400).json({ error: 'Insufficient coin balance' });

    const newCoin = coin_balance - coin_amount;
    const newToken = token_balance + coin_amount;

    const updateSql = 'UPDATE crypto_users SET coin_balance = ?, token_balance = ? WHERE id = ?';
    db.query(updateSql, [newCoin, newToken, user_id], (err) => {
      if (err) return res.status(500).json({ error: 'Update failed' });

      // Insert into transaction history
      const insertHistory = `INSERT INTO transaction_history (user_id, type, amount) VALUES (?, 'coin_to_token', ?)`;
      db.query(insertHistory, [user_id, coin_amount], (historyErr) => {
        if (historyErr) console.error('Transaction log failed:', historyErr);
      });

      res.json({ success: true, coin_balance: newCoin, token_balance: newToken });
    });
  });
});


// Convert Token to Peso
app.post('/api/convert-token-to-peso', (req, res) => {
  const { user_id, token_amount } = req.body;
  const getPrice = currentTokenPrice;
  const peso_value = parseFloat(token_amount) * parseFloat(getPrice);

  db.query('SELECT token_balance, balance FROM crypto_users WHERE id = ?', [user_id], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ error: 'User not found' });

    const token_balance = parseFloat(results[0].token_balance);
    const balance = parseFloat(results[0].balance);

    if (token_balance < token_amount) return res.status(400).json({ error: 'Insufficient token balance' });

    const newToken = token_balance - token_amount;
    const newBalance = balance + peso_value;

    db.query(
      'UPDATE crypto_users SET token_balance = ?, balance = ? WHERE id = ?',
      [newToken, newBalance, user_id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Update failed' });

        // Insert into transaction history
        const insertHistory = `INSERT INTO transaction_history (user_id, type, amount) VALUES (?, 'token_to_peso', ?)`;
        db.query(insertHistory, [user_id, peso_value], (historyErr) => {
          if (historyErr) console.error('Transaction log failed:', historyErr);
        });

        res.json({
          success: true,
          token_balance: newToken,
          balance: newBalance,
          exchange_rate: getPrice
        });
      }
    );
  });
});

//convert peso to token
app.post('/api/convert-peso-to-token', (req, res) => {
  const { user_id, peso_amount } = req.body;
  const getPrice = currentTokenPrice; // same price from chart
  const token_value = parseFloat(peso_amount) / parseFloat(getPrice);

  db.query('SELECT token_balance, balance FROM crypto_users WHERE id = ?', [user_id], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ error: 'User not found' });

    const pesoBalance = parseFloat(results[0].balance);
    const tokenBalance = parseFloat(results[0].token_balance);

    if (pesoBalance < peso_amount) return res.status(400).json({ error: 'Insufficient peso balance' });

    const newPeso = pesoBalance - peso_amount;
    const newToken = tokenBalance + token_value;

    db.query(
      'UPDATE crypto_users SET balance = ?, token_balance = ? WHERE id = ?',
      [newPeso, newToken, user_id],
      (err) => {
        if (err) return res.status(500).json({ error: 'Update failed' });

        const insertHistory = `INSERT INTO transaction_history (user_id, type, amount) VALUES (?, 'peso_to_token', ?)`;
        db.query(insertHistory, [user_id, token_value], (historyErr) => {
          if (historyErr) console.error('Transaction log failed:', historyErr);
        });

        res.json({
          success: true,
          token_balance: newToken,
          balance: newPeso,
          exchange_rate: getPrice,
          message: `Converted ₱${peso_amount} to ${token_value.toFixed(2)} tokens.`
        });
      }
    );
  });
});

// send token to wallet 
app.post('/api/send-token-to-crypto', (req, res) => {
  const { user_id, token_amount, wallet_address } = req.body;
  const getPrice = currentTokenPrice; // Optional: for record

  db.query('SELECT token_balance FROM crypto_users WHERE id = ?', [user_id], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ error: 'User not found' });

    const token_balance = parseFloat(results[0].token_balance);

    if (token_balance < token_amount) {
      return res.status(400).json({ error: 'Insufficient token balance' });
    }

    const newTokenBalance = token_balance - token_amount;

    db.query(
      'UPDATE crypto_users SET token_balance = ? WHERE id = ?',
      [newTokenBalance, user_id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: 'Token deduction failed' });

        const insertHistory = `
          INSERT INTO transaction_history (user_id, type, amount, wallet_address)
          VALUES (?, 'token_to_crypto', ?, ?)
        `;
        db.query(insertHistory, [user_id, token_amount, wallet_address], (logErr) => {
          if (logErr) console.error('Transaction log failed:', logErr);

          res.json({
            success: true,
            new_token_balance: newTokenBalance,
            sent_to_wallet: wallet_address,
            exchange_rate: getPrice,
          });
        });
      }
    );
  });
});

app.get('/api/transaction-history/:user_id', (req, res) => {
  const userId = req.params.user_id;

  const sql = 'SELECT created_at, type, amount FROM transaction_history WHERE user_id = ? ORDER BY created_at DESC';
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching transaction history:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.json(results);
  });
});


let currentTokenPrice = 0.50;

setInterval(() => {
  const random = Math.random();
  let change = 0;

  if (random < 0.01) {
    // 1% chance: MEGA SPIKE (to ₱5000)
    currentTokenPrice = 3000 + Math.random() * 2000; // ₱3000–₱5000
    console.log('🚀 MEGA SPIKE! ₱' + currentTokenPrice.toFixed(2));
    return;
  } else if (random < 0.05) {
    // 4% chance: BIG DROP
    change = -((Math.random() * 1.5) + 0.5); // Drop ₱0.50–₱2.00
    console.log('📉 BIG CRASH!');
  } else if (random < 0.10) {
    // 5% chance: BIG SPIKE
    change = (Math.random() * 5) + 1; // Jump ₱1–₱6
    console.log('💥 BIG SPIKE!');
  } else {
    // 90% chance: Small fluctuations
    change = (Math.random() - 0.5) * 0.10; // -₱0.05 to ₱+0.05
  }

  // Apply change and clamp value
  const newPrice = currentTokenPrice + change;
  currentTokenPrice = Math.max(0.05, Math.min(newPrice, 5000));

  console.log(`💱 Token Price: ₱${currentTokenPrice.toFixed(2)}`);
}, 10000); // every 10 seconds


app.get('/api/token-price', (req, res) => {
  res.json({ price: currentTokenPrice });
});

// POST - Submit report
app.post('/api/crypto-report', (req, res) => {
  const { user_id, type, description } = req.body;

  if (!user_id || !type || !description) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  const sql = 'INSERT INTO report_history (user_id, type, description) VALUES (?, ?, ?)';
  db.query(sql, [user_id, type, description], (err, result) => {
    if (err) {
      console.error('Insert error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, message: 'Report submitted successfully' });
  });
});

app.get('/api/crypto-report/:user_id', (req, res) => {
  const { user_id } = req.params;

  const sql = 'SELECT * FROM report_history WHERE user_id = ? ORDER BY created_at DESC';
  db.query(sql, [user_id], (err, results) => {
    if (err) {
      console.error('Fetch error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json(results);
  });
});

// GET /api/crypto-report → return all reports for admin
app.get('/api/crypto-report', (req, res) => {
  const sql = `
    SELECT 
      id,
      user_id,
      type,
      description,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS date
    FROM report_history
    ORDER BY created_at DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching all reports:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, reports: results });
  });
});

app.get('/api/admin/transaction-history', (req, res) => {
  const sql = `
    SELECT 
      t.id AS transaction_id,
      u.username AS user,
      t.type,
      t.amount,
      t.created_at AS date
    FROM transaction_history t
    JOIN crypto_users u ON t.user_id = u.id
    ORDER BY t.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('[❌ SQL Error]', err); // ✅ log full error
      return res.status(500).json({ success: false, message: 'Server error', error: err });
    }

    res.json({ success: true, transactions: results });
  });
});

app.get('/api/admin/withdrawal-history', (req, res) => {
  const query = `
    SELECT 
      cw.id AS withdrawal_id,
      cu.username AS user,
      cw.amount,
      cw.status,
      cw.created_at AS date
    FROM crypto_withdrawals cw
    JOIN crypto_users cu ON cw.user_id = cu.id
    ORDER BY cw.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching withdrawals:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, withdrawals: results });
  });
});


app.get('/api/admin/deposit-history', (req, res) => {
  const query = `
    SELECT 
      cd.id AS deposit_id,
      cu.username AS user,
      cd.amount,
      cd.method,
      cd.created_at AS date
    FROM crypto_deposits cd
    JOIN crypto_users cu ON cd.user_id = cu.id
    ORDER BY cd.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('❌ Error fetching deposits:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
    res.json({ success: true, deposits: results });
  });
});

app.post('/api/save-wallet', (req, res) => {
  const { user_id, wallet_address } = req.body;

  console.log("🟡 Received user_id:", user_id);
  console.log("🟡 Received wallet_address:", wallet_address);

  if (!user_id || !wallet_address) {
    console.log("❌ Missing user_id or wallet_address");
    return res.status(400).json({ success: false, message: 'Missing user_id or wallet_address' });
  }

  const sql = 'UPDATE crypto_users SET wallet_address = ? WHERE id = ?';
  db.query(sql, [wallet_address, user_id], (err, result) => {
    if (err) {
      console.error("❌ SQL Error:", err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    console.log("🟢 MySQL result:", result);

    if (result.affectedRows === 0) {
      console.log("⚠️ No user found with that ID.");
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log("✅ Wallet address saved for user", user_id);
    res.json({ success: true });

    if (result.affectedRows === 0) {
  console.log("⚠️ No user found with that ID.");
  return res.status(404).json({ success: false, message: 'User not found' });
}

  });
});




// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});