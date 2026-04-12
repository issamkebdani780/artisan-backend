const mysql = require('mysql2/promise');
require('dotenv').config();

async function testConnection() {
    console.log('--- Database Proxy Verification ---');
    console.log('Attempting to connect to:', process.env.MYSQL_URL.split('@')[1]); // Log host only for safety
    
    try {
        const connection = await mysql.createConnection(process.env.MYSQL_URL);
        console.log('✅ SUCCESS: Connection established!');
        
        const [rows] = await connection.query('SELECT 1 as result');
        console.log('✅ SUCCESS: Query executed (Result: ' + rows[0].result + ')');
        
        await connection.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ FAILURE: Could not connect to the database.');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        process.exit(1);
    }
}

testConnection();
