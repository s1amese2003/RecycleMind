// 引入依赖
const express = require('express');
const cors = require('cors');
const solver = require('javascript-lp-solver');
const db = require('./db'); // 引入数据库连接池

// 创建 Express 应用
const app = express();
const port = 3000; // 你可以指定任何未被占用的端口

// --- 中间件配置 ---
// 1. 使用 cors 中间件解决跨域问题
app.use(cors()); 

// 2. 使用 express.json() 中间件来解析请求体中的 JSON 数据
app.use(express.json());

/*
--  请在您的 MySQL 数据库 'recycle_mind' 中执行以下 SQL 语句来为 'waste_materials' 表添加新字段：
ALTER TABLE waste_materials
ADD COLUMN yield_rate DECIMAL(5, 2) DEFAULT 100.00 COMMENT '出水率',
ADD COLUMN actual_unit_price DECIMAL(10, 2) COMMENT '实际单价';

-- 更新现有数据（可选，如果需要根据当前数据计算）
UPDATE waste_materials SET actual_unit_price = unit_price / (yield_rate / 100) WHERE yield_rate IS NOT NULL AND yield_rate > 0;
*/

// --- API 路由定义 ---

// --- 用户认证 API ---
/**
 * 登录接口
 * POST /api/user/login
 */
app.post('/api/user/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('登录请求(明文模式):', { username });
  if (!username || !password) {
    return res.status(400).json({ code: 40001, message: '用户名和密码不能为空。' });
  }
  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password]
    );
    if (users.length > 0) {
      const user = users[0];
      if (!user.is_active) {
        return res.status(403).json({ code: 50012, message: '该账户已被禁用，请联系管理员。' });
      }
      res.json({
        code: 20000,
        data: { token: `mock-${user.username}-token` }
      });
    } else {
      res.status(401).json({ code: 50008, message: '用户名或密码错误。' });
    }
  } catch (error) {
    console.error('登录 API 查询数据库时出错:', error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，请稍后重试。' });
  }
});

/**
 * 获取用户信息的接口
 * GET /api/user/info
 */
app.get('/api/user/info', async (req, res) => {
  const token = req.headers['x-token'];
  console.log('接收到获取用户信息的请求，token:', token);
  if (token && token.startsWith('mock-') && token.endsWith('-token')) {
    const username = token.substring(5, token.length - 6);
    console.log('从 token 中解析出的用户名:', username);
    try {
      const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
      if (users.length === 0) {
        return res.status(404).json({ code: 50014, message: '用户不存在。' });
      }
      const user = users[0];
      res.json({
        code: 20000,
        data: {
          roles: [user.role],
          introduction: `我是一名 ${user.role}`,
          avatar: 'https://wpimg.wallstcn.com/f778738c-e4f8-4870-b634-56703b4acafe.gif',
          name: user.username
        }
      });
    } catch (error) {
      console.error('获取用户信息 API 查询数据库时出错:', error);
      res.status(500).json({ code: 50000, message: '服务器内部错误，请稍后重试。' });
    }
  } else {
    res.status(401).json({ code: 50008, message: '无效的 token' });
  }
});

/**
 * 用户登出接口
 * POST /api/user/logout
 */
app.post('/api/user/logout', (req, res) => {
  console.log('接收到登出请求');
  res.json({ code: 20000, data: 'success' });
});

// --- 废料管理 API ---
/**
 * 获取废料列表
 * GET /api/waste-material/list
 */
app.get('/api/waste-material/list', async (req, res) => {
  const { keyword, page = 1, limit = 20 } = req.query;
  console.log('接收到获取废料列表的请求, query:', req.query);

  try {
    let whereClause = '';
    const queryParams = [];

    if (keyword) {
      whereClause = 'WHERE name LIKE ? OR storage_area LIKE ?';
      queryParams.push(`%${keyword}%`);
      queryParams.push(`%${keyword}%`);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM waste_materials ${whereClause}`;
    const [countRows] = await db.query(countQuery, queryParams);
    const total = countRows[0].total;

    // Get paginated data
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const dataQuery = `SELECT * FROM waste_materials ${whereClause} ORDER BY id ASC LIMIT ? OFFSET ?`;
    const dataParams = [...queryParams, parseInt(limit, 10), offset];
    
    const [rows] = await db.query(dataQuery, dataParams);

    const items = rows.map(item => ({
        ...item,
        stock: item.stock_kg
    }));

    res.json({
      code: 20000,
      data: { items: items, total: total }
    });
  } catch (error) {
    console.error('获取废料列表 API 查询数据库时出错:', error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，获取废料列表失败。' });
  }
});

/**
 * 新增废料
 * POST /api/waste-material
 */
app.post('/api/waste-material', async (req, res) => {
  const { name, storage_area, composition, stock_kg, unit_price, yield_rate } = req.body;
  const actual_unit_price = (unit_price && yield_rate) ? unit_price / (yield_rate / 100) : 0;
  console.log('接收到新增废料请求:', { name });
  try {
    const [result] = await db.query(
      'INSERT INTO waste_materials (name, storage_area, composition, stock_kg, unit_price, yield_rate, actual_unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, storage_area, JSON.stringify(composition), stock_kg, unit_price, yield_rate, actual_unit_price]
    );
    res.status(201).json({
      code: 20000,
      data: { id: result.insertId, ...req.body, actual_unit_price }
    });
  } catch (error) {
    console.error('新增废料 API 数据库操作出错:', error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，新增废料失败。' });
  }
});

/**
 * 修改废料
 * PUT /api/waste-material/:id
 */
app.put('/api/waste-material/:id', async (req, res) => {
  const { id } = req.params;
  const { name, storage_area, composition, stock_kg, unit_price, yield_rate } = req.body;
  const actual_unit_price = (unit_price && yield_rate) ? unit_price / (yield_rate / 100) : 0;
  console.log(`接收到修改废料 ${id} 的请求:`, { name });
  try {
    const [result] = await db.query(
      'UPDATE waste_materials SET name = ?, storage_area = ?, composition = ?, stock_kg = ?, unit_price = ?, yield_rate = ?, actual_unit_price = ? WHERE id = ?',
      [name, storage_area, JSON.stringify(composition), stock_kg, unit_price, yield_rate, actual_unit_price, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 40401, message: '未找到指定ID的废料。' });
    }
    res.json({ code: 20000, data: 'success' });
  } catch (error) {
    console.error(`修改废料 ${id} API 数据库操作出错:`, error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，修改废料失败。' });
  }
});

/**
 * 删除废料
 * DELETE /api/waste-material/:id
 */
app.delete('/api/waste-material/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`接收到删除废料 ${id} 的请求`);
  try {
    const [result] = await db.query('DELETE FROM waste_materials WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 40401, message: '未找到指定ID的废料。' });
    }
    res.json({ code: 20000, data: 'success' });
  } catch (error) {
    console.error(`删除废料 ${id} API 数据库操作出错:`, error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，删除废料失败。' });
  }
});


// --- 产品管理 API ---

/*
--  请在您的 MySQL 数据库 'recycle_mind' 中执行以下 SQL 语句来创建 'products' 表：
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    model_number VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    si_min DECIMAL(10, 5) DEFAULT 0.0,
    si_max DECIMAL(10, 5) DEFAULT 0.0,
    fe_min DECIMAL(10, 5) DEFAULT 0.0,
    fe_max DECIMAL(10, 5) DEFAULT 0.0,
    cu_min DECIMAL(10, 5) DEFAULT 0.0,
    cu_max DECIMAL(10, 5) DEFAULT 0.0,
    mn_min DECIMAL(10, 5) DEFAULT 0.0,
    mn_max DECIMAL(10, 5) DEFAULT 0.0,
    mg_min DECIMAL(10, 5) DEFAULT 0.0,
    mg_max DECIMAL(10, 5) DEFAULT 0.0,
    ti_min DECIMAL(10, 5) DEFAULT 0.0,
    ti_max DECIMAL(10, 5) DEFAULT 0.0,
    cr_min DECIMAL(10, 5) DEFAULT 0.0,
    cr_max DECIMAL(10, 5) DEFAULT 0.0,
    zn_min DECIMAL(10, 5) DEFAULT 0.0,
    zn_max DECIMAL(10, 5) DEFAULT 0.0,
    zr_min DECIMAL(10, 5) DEFAULT 0.0,
    zr_max DECIMAL(10, 5) DEFAULT 0.0,
    others_min DECIMAL(10, 5) DEFAULT 0.0,
    others_max DECIMAL(10, 5) DEFAULT 0.0,
    total_others_min DECIMAL(10, 5) DEFAULT 0.0,
    total_others_max DECIMAL(10, 5) DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
*/

const mapRowToProduct = (row) => {
    if (!row) return null;
    return {
        id: row.id,
        customer_name: row.customer_name,
        model_number: row.model_number,
        Si: { min: row.si_min, max: row.si_max },
        Fe: { min: row.fe_min, max: row.fe_max },
        Cu: { min: row.cu_min, max: row.cu_max },
        Mn: { min: row.mn_min, max: row.mn_max },
        Mg: { min: row.mg_min, max: row.mg_max },
        Ti: { min: row.ti_min, max: row.ti_max },
        Cr: { min: row.cr_min, max: row.cr_max },
        Zn: { min: row.zn_min, max: row.zn_max },
        Zr: { min: row.zr_min, max: row.zr_max },
        others: { min: row.others_min, max: row.others_max },
        total_others: { min: row.total_others_min, max: row.total_others_max },
        created_at: row.created_at,
        updated_at: row.updated_at
    };
};

const mapProductToDbPayload = (product) => {
    const payload = {
        customer_name: product.customer_name,
        model_number: product.model_number,
        si_min: product.Si?.min ?? 0.0,
        si_max: product.Si?.max ?? 0.0,
        fe_min: product.Fe?.min ?? 0.0,
        fe_max: product.Fe?.max ?? 0.0,
        cu_min: product.Cu?.min ?? 0.0,
        cu_max: product.Cu?.max ?? 0.0,
        mn_min: product.Mn?.min ?? 0.0,
        mn_max: product.Mn?.max ?? 0.0,
        mg_min: product.Mg?.min ?? 0.0,
        mg_max: product.Mg?.max ?? 0.0,
        ti_min: product.Ti?.min ?? 0.0,
        ti_max: product.Ti?.max ?? 0.0,
        cr_min: product.Cr?.min ?? 0.0,
        cr_max: product.Cr?.max ?? 0.0,
        zn_min: product.Zn?.min ?? 0.0,
        zn_max: product.Zn?.max ?? 0.0,
        zr_min: product.Zr?.min ?? 0.0,
        zr_max: product.Zr?.max ?? 0.0,
        others_min: product.others?.min ?? 0.0,
        others_max: product.others?.max ?? 0.0,
        total_others_min: product.total_others?.min ?? 0.0,
        total_others_max: product.total_others?.max ?? 0.0,
    };
    Object.keys(payload).forEach(key => (payload[key] === undefined || payload[key] === null) && delete payload[key]);
    return payload;
};

/**
 * 获取产品列表
 * GET /api/products
 */
app.get('/api/products', async (req, res) => {
    console.log('接收到获取产品列表的请求');
    try {
        const [rows] = await db.query('SELECT * FROM products ORDER BY id ASC');
        const items = rows.map(mapRowToProduct);
        res.json({
            code: 20000,
            data: {
                items: items,
                total: items.length
            }
        });
    } catch (error) {
        console.error('获取产品列表 API 查询数据库时出错:', error);
        res.status(500).json({ code: 50000, message: '服务器内部错误，获取产品列表失败。' });
    }
});

/**
 * 新增产品
 * POST /api/products
 */
app.post('/api/products', async (req, res) => {
    const productData = req.body;
    console.log('接收到新增产品请求:', productData);

    if (!productData || !productData.customer_name || !productData.model_number) {
        return res.status(400).json({ code: 40001, message: '客户名称和型号不能为空。' });
    }

    try {
        const payload = mapProductToDbPayload(productData);
        const columns = Object.keys(payload).join(', ');
        const placeholders = Object.keys(payload).map(() => '?').join(', ');
        const values = Object.values(payload);
        const sql = `INSERT INTO products (${columns}) VALUES (${placeholders})`;
        const [result] = await db.query(sql, values);
        const [newProduct] = await db.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
        res.status(201).json({
            code: 20000,
            data: mapRowToProduct(newProduct[0])
        });
    } catch (error) {
        console.error('新增产品 API 数据库操作出错:', error);
        res.status(500).json({ code: 50000, message: '服务器内部错误，新增产品失败。' });
    }
});

/**
 * 修改产品
 * PUT /api/products/:id
 */
app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const productData = req.body;
    console.log(`接收到修改产品 ${id} 的请求:`, productData);

    try {
        const payload = mapProductToDbPayload(productData);
        if (Object.keys(payload).length === 0) {
            return res.status(400).json({ code: 40001, message: '没有提供需要更新的字段。' });
        }
        const setClauses = Object.keys(payload).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(payload), id];
        const sql = `UPDATE products SET ${setClauses} WHERE id = ?`;
        const [result] = await db.query(sql, values);
        if (result.affectedRows === 0) {
            return res.status(404).json({ code: 40401, message: '未找到指定ID的产品。' });
        }
        const [updatedProduct] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
        res.json({ 
            code: 20000, 
            data: mapRowToProduct(updatedProduct[0])
        });
    } catch (error) {
        console.error(`修改产品 ${id} API 数据库操作出错:`, error);
        res.status(500).json({ code: 50000, message: '服务器内部错误，修改产品失败。' });
    }
});

/**
 * 删除产品
 * DELETE /api/products/:id
 */
app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`接收到删除产品 ${id} 的请求`);
    try {
        const [result] = await db.query('DELETE FROM products WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ code: 40401, message: '未找到指定ID的产品。' });
        }
        res.json({ code: 20000, data: 'success' });
    } catch (error) {
        console.error(`删除产品 ${id} API 数据库操作出错:`, error);
        res.status(500).json({ code: 50000, message: '服务器内部错误，删除产品失败。' });
    }
});

// --- 交易管理 API ---
/**
 * 获取交易列表
 * GET /api/transaction/list
 */
app.get('/api/transaction/list', async (req, res) => {
  console.log('接收到获取交易列表的请求');
  try {
    const [items] = await db.query('SELECT * FROM transactions ORDER BY created_at DESC');
    res.json({
      code: 20000,
      data: {
        items: items
      }
    });
  } catch (error) {
    console.error('获取交易列表 API 查询数据库时出错:', error);
    res.status(500).json({
      code: 50000,
      message: '服务器内部错误，获取交易列表失败。'
    });
  }
});

// --- 生产管理 API ---
/**
 * 获取生产记录列表
 * GET /api/production/record/list
 */
app.get('/api/production/record/list', async (req, res) => {
  console.log('接收到获取生产记录列表的请求');
  const { page = 1, limit = 20 } = req.query;

  try {
    const whereClause = "WHERE id LIKE 'plan_%'";

    // 获取总数
    const countQuery = `SELECT COUNT(*) as total FROM production_records ${whereClause}`;
    const [countRows] = await db.query(countQuery);
    const total = countRows[0].total;

    // 获取分页数据
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const dataQuery = `SELECT * FROM production_records ${whereClause} ORDER BY production_time DESC LIMIT ? OFFSET ?`;
    const [rows] = await db.query(dataQuery, [parseInt(limit, 10), offset]);

    res.json({
      code: 20000,
      data: {
        items: rows,
        total: total
      }
    });
  } catch (error) {
    console.error('获取生产记录列表 API 查询数据库时出错:', error);
    res.status(500).json({
      code: 50000,
      message: '服务器内部错误，获取生产记录列表失败。'
    });
  }
});

/**
 * 新增生产记录
 * POST /api/production/record
 */
app.post('/api/production/record', async (req, res) => {
  const { id, plan_id, product_name, actual_amount, unit, production_time, operator, quality_check, materials_used, quality_report } = req.body;
  const formattedProductionTime = production_time.replace('T', ' ').substring(0, 19);
  try {
    await db.query(
      'INSERT INTO production_records (id, plan_id, product_name, actual_amount, unit, production_time, operator, quality_check, materials_used, quality_report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, plan_id, product_name, actual_amount, unit, formattedProductionTime, operator, quality_check, JSON.stringify(materials_used), quality_report]
    );
    res.status(201).json({ code: 20000, data: { ...req.body } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 40901, message: '生产记录ID已存在。' });
    }
    console.error('新增生产记录 API 出错:', error);
    res.status(500).json({ code: 50000, message: '服务器错误，新增生产记录失败。' });
  }
});

/**
 * 修改生产记录
 * PUT /api/production/record/:id
 */
// app.put('/api/production/record/:id', async (req, res) => {
//   const { id } = req.params;
//   const { plan_id, product_name, actual_amount, unit, production_time, operator, quality_check, materials_used, quality_report } = req.body;
//   const formattedProductionTime = production_time.replace('T', ' ').substring(0, 19);
//   try {
//     const [result] = await db.query(
//       'UPDATE production_records SET plan_id = ?, product_name = ?, actual_amount = ?, unit = ?, production_time = ?, operator = ?, quality_check = ?, materials_used = ?, quality_report = ? WHERE id = ?',
//       [plan_id, product_name, actual_amount, unit, formattedProductionTime, operator, quality_check, JSON.stringify(materials_used), quality_report, id]
//     );
//     if (result.affectedRows === 0) return res.status(404).json({ code: 40401, message: '未找到记录。' });
//     res.json({ code: 20000, data: 'success' });
//   } catch (error) {
//     console.error(`修改生产记录 ${id} API 出错:`, error);
//     res.status(500).json({ code: 50000, message: '服务器错误，修改生产记录失败。' });
//   }
// });

/**
 * 删除生产记录
 * DELETE /api/production/record/:id
 */
app.delete('/api/production/record/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query('DELETE FROM production_records WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ code: 40401, message: '未找到记录。' });
    res.json({ code: 20000, data: 'success' });
  } catch (error) {
    console.error(`删除生产记录 ${id} API 出错:`, error);
    res.status(500).json({ code: 50000, message: '服务器错误，删除生产记录失败。' });
  }
});

// --- 用户管理 API ---
/**
 * 获取用户列表
 * GET /api/users
*/
app.get('/api/users', async (req, res) => {
  console.log('接收到获取用户列表的请求');
  try {
    const [users] = await db.query("SELECT id, username, role, email, is_active, created_at FROM users");
    res.json({
        code: 20000,
        data: users
    });
  } catch (error) {
    console.error('获取用户列表 API 查询数据库时出错:', error);
    res.status(500).json({
      code: 50000,
      message: '服务器内部错误，获取用户列表失败。'
    });
  }
});

/**
 * 新增用户 (密码不加密)
 * POST /api/users
 */
app.post('/api/users', async (req, res) => {
  const { username, password, role, email } = req.body;
  console.log('接收到新增用户请求:', { username, role, email });

  if (!username || !password) {
    return res.status(400).json({ code: 40001, message: '用户名和密码不能为空。' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO users (username, password, role, email) VALUES (?, ?, ?, ?)',
      [username, password, role, email]
    );
    res.status(201).json({
      code: 20000,
      data: { id: result.insertId, username, role, email }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 40901, message: '用户名或邮箱已存在。' });
    }
    console.error('新增用户 API 数据库操作出错:', error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，新增用户失败。' });
  }
});

/**
 * 修改用户
 * PUT /api/users/:id
 */
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, role, email, is_active } = req.body;
  console.log(`接收到修改用户 ${id} 的请求:`, { username, role, email, is_active });

  try {
    const fieldsToUpdate = {};
    if (username !== undefined) fieldsToUpdate.username = username;
    if (role !== undefined) fieldsToUpdate.role = role;
    if (email !== undefined) fieldsToUpdate.email = email;
    if (is_active !== undefined) fieldsToUpdate.is_active = is_active;

    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({ code: 40002, message: '没有提供任何需要更新的字段。' });
    }

    const setClause = Object.keys(fieldsToUpdate).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(fieldsToUpdate), id];

    const [result] = await db.query(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 40401, message: '未找到指定ID的用户。' });
    }

    res.json({ code: 20000, data: 'success' });
  } catch (error) {
     if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 40901, message: '用户名或邮箱已存在。' });
    }
    console.error(`修改用户 ${id} API 数据库操作出错:`, error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，修改用户失败。' });
  }
});

/**
 * 删除用户
 * DELETE /api/users/:id
 */
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`接收到删除用户 ${id} 的请求`);

  if (id === '1') {
    return res.status(403).json({ code: 40301, message: '出于安全考虑，禁止删除超级管理员。' });
  }

  try {
    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 40401, message: '未找到指定ID的用户。' });
    }
    
    res.json({ code: 20000, data: 'success' });
  } catch (error) {
    console.error(`删除用户 ${id} API 数据库操作出错:`, error);
    res.status(500).json({ code: 50000, message: '服务器内部错误，删除用户失败。' });
  }
});


// --- 配方计算 API ---
/**
 * 配方计算
 * POST /api/recipe/calculate
 */
app.post('/api/recipe/calculate', async (req, res) => {
    const { requirements, excluded_ids, enable_safety_margin } = req.body;
    console.log('接收到配方计算请求:', { requirements, excluded_ids, enable_safety_margin });

    if (!requirements || Object.keys(requirements).length === 0) {
        return res.status(400).json({ code: 40001, message: '产品需求参数不能为空。' });
    }

    try {
        // 1. 从数据库获取所有废料信息
        let query = 'SELECT * FROM waste_materials WHERE stock_kg > 0';
        const queryParams = [];
        if (excluded_ids && excluded_ids.length > 0) {
          query += ' AND id NOT IN (?)';
          queryParams.push(excluded_ids);
        }
        
        const [wasteMaterials] = await db.query(query, queryParams);
        if (wasteMaterials.length === 0) {
            return res.status(500).json({ code: 50001, message: '符合条件的废料库存为空，无法进行计算。' });
        }

        // 2. 构建线性规划模型
        
        // 2.1 识别所有指定元素及"其他"元素
        const specifiedElements = Object.keys(requirements).filter(el => el !== 'others' && el !== 'total_others');
        const allElementsInWaste = new Set();
        wasteMaterials.forEach(m => {
            const composition = (typeof m.composition === 'string' ? JSON.parse(m.composition) : m.composition) || {};
            Object.keys(composition).forEach(el => allElementsInWaste.add(el));
        });
        const otherElements = [...allElementsInWaste].filter(el => !specifiedElements.includes(el));

        console.log('指定元素:', specifiedElements);
        console.log('其他元素:', otherElements);
        
        // 2.2 初始化模型
        const model = {
            optimize: "cost",
            opType: "min",
            constraints: {
                total_percentage: { equal: 1 }
            },
            variables: {},
        };

        // 安全余量系数 (例如, 5%)
        const safetyFactor = 0.05;

        // 2.3 添加主要元素的约束
        specifiedElements.forEach(el => {
            const req = requirements[el];
            if (req) {
                let { min, max } = req;

                // 应用安全余量
                if (enable_safety_margin) {
                    const range = max - min;
                    // 如果范围有效，则应用安全余量；否则保持原样以避免无效约束
                    if (range > 0) {
                        min = min * (1 + safetyFactor);
                        max = max * (1 - safetyFactor);
                    }
                    console.log(`应用安全余量后 ${el} 的范围: min=${min}, max=${max}`);
                }
                
                const constraint = {};
                if (min > 0) constraint.min = min / 100;
                if (max > 0 && max >= min) constraint.max = max / 100;
                if (Object.keys(constraint).length > 0) model.constraints[el] = constraint;
            }
        });

        // 2.4 添加 "其他单个元素" (others) 的约束
        if (requirements.others && requirements.others.max > 0) {
            otherElements.forEach(el => {
                model.constraints[`other_${el}`] = { max: requirements.others.max / 100 };
            });
        }
        
        // 2.5 添加 "其他元素合计" (total_others) 的约束
        if (requirements.total_others && requirements.total_others.max > 0) {
            model.constraints.total_others_sum = { max: requirements.total_others.max / 100 };
        }

        // 2.6 为每个废料创建变量及其对各约束的贡献
        wasteMaterials.forEach(material => {
            const composition = (typeof material.composition === 'string' ? JSON.parse(material.composition) : material.composition) || {};
            const yieldRate = (parseFloat(material.yield_rate) || 100) / 100; // 转换为小数, e.g., 95% -> 0.95
            
            // 使用原始单价作为成本
            const variable = {
                cost: parseFloat(material.unit_price) || 0,
                total_percentage: 1
            };
            const variableName = `mat_${material.id}`;

            // 添加主要元素的贡献, 考虑出水率
            // 元素贡献 = (原料中的元素含量 %) * 出水率
            specifiedElements.forEach(el => {
                variable[el] = ((composition[el] || 0) / 100) * yieldRate;
            });

            // 添加 "其他单个元素" 的贡献, 考虑出水率
            if (requirements.others && requirements.others.max > 0) {
                otherElements.forEach(el => {
                    variable[`other_${el}`] = ((composition[el] || 0) / 100) * yieldRate;
                });
            }
            
            // 添加 "其他元素合计" 的贡献, 考虑出水率
            if (requirements.total_others && requirements.total_others.max > 0) {
                const otherElementsSum = otherElements.reduce((sum, el) => sum + (composition[el] || 0), 0);
                variable.total_others_sum = (otherElementsSum / 100) * yieldRate;
            }

            model.variables[variableName] = variable;
        });
        
        console.log("构建的线性规划模型:", JSON.stringify(model, null, 2));

        // 3. 求解
        const results = solver.Solve(model);
        console.log("求解结果:", results);

        // 4. 处理并返回结果
        if (results.feasible) {
            // 4.1 格式化配方结果
            const recipe = Object.keys(results)
                .filter(key => key.startsWith('mat_'))
                .map(key => {
                    const materialId = parseInt(key.substring(4));
                    const material = wasteMaterials.find(m => m.id === materialId);
                    const percentage = results[key] * 100; // 结果中的值是比例, 转换为百分比
                    
                    return {
                        id: material.id,
                        name: material.name,
                        storage_area: material.storage_area,
                        percentage: percentage,
                        // 注意：这里的成本计算需要重新审视。模型优化的是基于原始单价的成本。
                        // 返回给前端的`cost`应该是 `(percentage / 100) * material.unit_price`
                        cost: (percentage / 100) * (parseFloat(material.unit_price) || 0),
                        yield_rate: material.yield_rate
                    };
                })
                .filter(item => item.percentage > 0.001); // 过滤掉占比极小的

            // 4.2 计算最终成品成分
            const finalComposition = {};
            specifiedElements.forEach(el => {
                finalComposition[el] = 0;
            });
            otherElements.forEach(el => {
                finalComposition[el] = 0;
            });

            recipe.forEach(item => {
                const material = wasteMaterials.find(m => m.id === item.id);
                const composition = (typeof material.composition === 'string' ? JSON.parse(material.composition) : material.composition) || {};
                const yieldRate = (parseFloat(material.yield_rate) || 100) / 100;

                Object.keys(composition).forEach(el => {
                    finalComposition[el] = (finalComposition[el] || 0) + (composition[el] * (item.percentage / 100) * yieldRate);
                });
            });
            
            // 4.3 计算总成本 (按每公斤成品计算)
            const totalCost = recipe.reduce((acc, item) => acc + item.cost, 0);

            res.json({
                code: 20000,
                data: {
                    recipe: recipe,
                    totalCost: totalCost,
                    finalComposition: finalComposition,
                    model: model // for debugging
                }
            });
        } else {
            res.status(500).json({ code: 50002, message: '无法找到满足条件的配方，请检查产品要求或废料库存。' });
        }

    } catch (error) {
        console.error('配方计算 API 出错:', error);
        res.status(500).json({ code: 50000, message: '服务器内部错误，计算失败。' });
    }
});

/**
 * 执行生产，更新库存并创建生产记录
 * POST /api/production/execute
 */
app.post('/api/production/execute', async (req, res) => {
    const { productName, targetAmount, recipe, operator } = req.body;
    console.log('接收到创建生产计划请求:', { productName, targetAmount });

    if (!productName || !targetAmount || !recipe || recipe.length === 0) {
        return res.status(400).json({ code: 40001, message: '生产计划参数不完整。' });
    }
    
    // 新流程：只创建生产记录，状态为“待审批”，不涉及库存操作。
    const connection = await db.getConnection();
    try {
        const materialsUsed = recipe.map(item => {
            const materialAmount = targetAmount * item.percentage / 100;
            return {
                id: item.id,
                name: item.name,
                amount: parseFloat(materialAmount.toFixed(2)),
                percentage: item.percentage
            };
        });

        const record = {
            id: `plan_${new Date().getTime()}`, // 使用 plan_ 前缀以示区分
            product_name: productName,
            actual_amount: targetAmount, // 修正字段名，之前是 target_amount
            unit: 'kg',
            production_time: new Date(),
            operator: operator || 'System', // 从前端获取操作员，默认为 System
            quality_check: '待审批', // 默认状态为待审批
            materials_used: JSON.stringify(materialsUsed)
        };
        
        await connection.query('INSERT INTO production_records SET ?', record);

        res.status(201).json({ code: 20000, data: { message: '生产计划已创建，等待审批。' } });
    } catch (error) {
        console.error('创建生产计划时出错:', error);
        res.status(500).json({ code: 50000, message: '服务器内部错误，创建生产计划失败。' });
    } finally {
        connection.release();
    }
});

/**
 * 审批生产计划并执行库存扣减
 * POST /api/production/record/:id/approve
 */
app.post('/api/production/record/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { approver } = req.body; // 获取审批员姓名
    console.log(`接收到审批生产计划 ${id} 的请求`);

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. 获取并锁定生产记录
        const [records] = await connection.query('SELECT * FROM production_records WHERE id = ? FOR UPDATE', [id]);
        if (records.length === 0) {
            throw new Error('未找到指定的生产计划。');
        }
        const record = records[0];

        // 2. 检查状态，防止重复执行
        if (record.quality_check !== '待审批') {
            throw new Error(`该生产计划状态为“${record.quality_check}”，无法批准。`);
        }

        // 防御性检查：确保配方数据存在且不为空
        if (!record.materials_used) {
            throw new Error('配方数据丢失或已损坏，无法批准。');
        }

        let materialsUsed;
        try {
            materialsUsed = JSON.parse(record.materials_used);
        } catch (e) {
            console.error(`解析配方数据失败 (ID: ${id}):`, e);
            throw new Error('配方数据格式错误，无法解析。');
        }

        // 3. 检查库存并准备更新
        for (const item of materialsUsed) {
            const [rows] = await connection.query('SELECT stock_kg FROM waste_materials WHERE id = ? FOR UPDATE', [item.id]);

            if (rows.length === 0) {
                throw new Error(`未找到废料: ${item.name} (ID: ${item.id})`);
            }
            const currentStock = rows[0].stock_kg;
            if (currentStock < item.amount) {
                throw new Error(`废料库存不足: ${item.name} (需要 ${item.amount} kg, 现有 ${currentStock} kg)`);
            }
        }

        // 4. 库存充足，执行扣减
        for (const item of materialsUsed) {
            await connection.query('UPDATE waste_materials SET stock_kg = stock_kg - ? WHERE id = ?', [item.amount, item.id]);
        }
        
        // 5. 更新生产记录状态
        await connection.query(
            'UPDATE production_records SET quality_check = ?, operator = ? WHERE id = ?',
            ['已批准', approver || 'N/A', id]
        );

        await connection.commit();
        res.json({ code: 20000, data: { message: '生产计划已批准，库存已扣减。' } });

    } catch (error) {
        await connection.rollback();
        console.error(`审批生产计划 ${id} 时出错:`, error.message);
        res.status(500).json({ code: 50000, message: error.message || '服务器内部错误，审批失败。' });
    } finally {
        connection.release();
    }
});


// --- 启动服务器 ---
app.listen(port, async () => {
  try {
    const connection = await db.getConnection();
    console.log('🎉 数据库连接成功！');
    connection.release();
    console.log(`后端服务器正在 http://localhost:${port} 上运行`);
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }
});