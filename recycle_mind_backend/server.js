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
  console.log('接收到获取废料列表的请求');
  try {
    const [rows] = await db.query('SELECT * FROM waste_materials ORDER BY id ASC');
    const items = rows.map(item => ({
        ...item,
        stock: item.stock_kg
    }));
    res.json({
      code: 20000,
      data: { items: items, total: items.length }
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
  try {
    const [rows] = await db.query('SELECT * FROM production_records ORDER BY production_time DESC');
    const items = rows.map(item => ({
        id: item.id,
        planId: item.plan_id,
        productName: item.product_name,
        actualAmount: item.actual_amount,
        unit: item.unit,
        productionTime: item.production_time,
        operator: item.operator,
        qualityCheck: item.quality_check,
        qualityReport: item.quality_report,
        materials: item.materials
    }));
    res.json({
      code: 20000,
      data: {
        items: items
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
app.put('/api/production/record/:id', async (req, res) => {
  const { id } = req.params;
  const { plan_id, product_name, actual_amount, unit, production_time, operator, quality_check, materials_used, quality_report } = req.body;
  const formattedProductionTime = production_time.replace('T', ' ').substring(0, 19);
  try {
    const [result] = await db.query(
      'UPDATE production_records SET plan_id = ?, product_name = ?, actual_amount = ?, unit = ?, production_time = ?, operator = ?, quality_check = ?, materials_used = ?, quality_report = ? WHERE id = ?',
      [plan_id, product_name, actual_amount, unit, formattedProductionTime, operator, quality_check, JSON.stringify(materials_used), quality_report, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ code: 40401, message: '未找到记录。' });
    res.json({ code: 20000, data: 'success' });
  } catch (error) {
    console.error(`修改生产记录 ${id} API 出错:`, error);
    res.status(500).json({ code: 50000, message: '服务器错误，修改生产记录失败。' });
  }
});

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
  const { role, email, is_active } = req.body;
  console.log(`接收到修改用户 ${id} 的请求:`, { role, email, is_active });

  try {
    const [result] = await db.query(
      'UPDATE users SET role = ?, email = ?, is_active = ? WHERE id = ?',
      [role, email, is_active, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ code: 40401, message: '未找到指定ID的用户。' });
    }

    res.json({ code: 20000, data: 'success' });
  } catch (error) {
     if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 40901, message: '邮箱已存在。' });
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
    const { requirements } = req.body;
    console.log('接收到配方计算请求:', requirements);

    if (!requirements || Object.keys(requirements).length === 0) {
        return res.status(400).json({ code: 40001, message: '产品需求参数不能为空。' });
    }

    try {
        // 1. 从数据库获取所有废料信息
        const [wasteMaterials] = await db.query('SELECT * FROM waste_materials WHERE stock_kg > 0');
        if (wasteMaterials.length === 0) {
            return res.status(500).json({ code: 50001, message: '废料库存为空，无法进行计算。' });
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

        // 2.3 添加主要元素的约束
        specifiedElements.forEach(el => {
            const req = requirements[el];
            if (req) {
                const constraint = {};
                if (req.min > 0) constraint.min = req.min / 100;
                if (req.max > 0 && req.max >= req.min) constraint.max = req.max / 100;
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
            const yieldRate = parseFloat(material.yield_rate) || 100;
            
            // 变量代表的是每单位成品中，来自此原料的重量贡献（占成品重量的百分比）
            const variable = {
                cost: parseFloat(material.actual_unit_price) || 0,
                total_percentage: 1
            };
            const variableName = `mat_${material.id}`;

            // 添加主要元素的贡献
            // 元素含量 = (原料中的元素含量 %)，这里不需要乘以出水率，因为成本已经是 actual_unit_price
            specifiedElements.forEach(el => {
                variable[el] = (composition[el] || 0) / 100;
            });

            // 添加 "其他单个元素" 的贡献
            if (requirements.others && requirements.others.max > 0) {
                otherElements.forEach(el => {
                    variable[`other_${el}`] = (composition[el] || 0) / 100;
                });
            }

            // 添加 "其他元素合计" 的贡献
            if (requirements.total_others && requirements.total_others.max > 0) {
                const totalOthersInMaterial = otherElements.reduce((sum, el) => sum + (composition[el] || 0), 0);
                variable.total_others_sum = totalOthersInMaterial / 100;
            }
            
            model.variables[variableName] = variable; 
        });


        // 3. 求解
        console.log("构建的LP模型:", JSON.stringify(model, null, 2));
        const results = solver.Solve(model);
        console.log("求解结果:", results);

        // 4. 处理并返回结果
        if (results.feasible) {
            let totalCost = 0;
            const finalComposition = {}; // 最终成分

            let rawRecipe = Object.keys(results)
                .filter(key => key.startsWith('mat_'))
                .map(key => {
                    const contributionWeight = results[key]; // 这是该原料对最终1单位产品的重量贡献
                    const id = parseInt(key.substring(4), 10);
                    const material = wasteMaterials.find(m => m.id === id);
                    
                    if (!material || contributionWeight <= 0) return null;

                    const yieldRate = parseFloat(material.yield_rate) || 100;
                    // 需要投入的实际原料重量 = 对最终产品的重量贡献 / 出水率
                    const rawWeight = contributionWeight / (yieldRate / 100);

                    return {
                        id: id,
                        name: material.name,
                        storage_area: material.storage_area,
                        rawWeight: rawWeight,
                        material: material
                    };
                })
                .filter(item => item);

            // 根据需要的原料重量（rawWeight）来计算百分比
            const totalRawWeight = rawRecipe.reduce((sum, item) => sum + item.rawWeight, 0);
            if (totalRawWeight === 0) {
              return res.status(500).json({ code: 50003, message: '计算得到的总投入量为0，无法生成有效配方。' });
            }

            let recipe = rawRecipe.map(item => {
                const percentage = (item.rawWeight / totalRawWeight) * 100;
                return { ...item, percentage };
            });

            // --- 处理舍入误差，确保总和为100% ---
            const totalPercentage = recipe.reduce((sum, item) => sum + item.percentage, 0);
            if (totalPercentage !== 100) {
                const diff = 100 - totalPercentage;
                const maxItem = recipe.reduce((max, item) => item.percentage > max.percentage ? item : max, recipe[0]);
                maxItem.percentage += diff;
            }
            // --- 舍入误差处理结束 ---
            
            recipe = recipe.map(item => {
                const material = item.material;
                const composition = (typeof material.composition === 'string' ? JSON.parse(material.composition) : material.composition) || {};

                // 累加计算最终成分
                // 元素在最终成品中的含量 = Σ (该原料对成品的重量贡献 * 元素在原料中的含量)
                const contributionWeight = item.rawWeight * ( (parseFloat(material.yield_rate) || 100) / 100 );
                for (const element in composition) {
                    if (Object.prototype.hasOwnProperty.call(composition, element)) {
                        if (!finalComposition[element]) {
                            finalComposition[element] = 0;
                        }
                        finalComposition[element] += contributionWeight * (composition[element] / 100);
                    }
                }

                const itemCost = item.rawWeight * material.actual_unit_price; // 总成本用原料重量 * 原料实际单价
                totalCost += itemCost;
                
                return {
                    name: item.name,
                    storage_area: item.storage_area,
                    percentage: parseFloat(item.percentage.toFixed(2)),
                    cost: parseFloat(itemCost.toFixed(2))
                };
            }).filter(item => item && item.percentage > 0);
            
            // 归一化最终成分，使其总和为1
            const totalFinalComposition = Object.values(finalComposition).reduce((sum, val) => sum + val, 0);
            if (totalFinalComposition > 0) {
              for(const el in finalComposition) {
                finalComposition[el] = (finalComposition[el] / totalFinalComposition) * 100;
              }
            }

            // 格式化最终成分，保留小数点后4位以提高精度
            const formattedComposition = Object.keys(finalComposition).reduce((acc, key) => {
                acc[key] = parseFloat(finalComposition[key].toFixed(4));
                return acc;
            }, {});

            const responseData = {
                recipe: recipe,
                totalCost: parseFloat(totalCost.toFixed(2)),
                finalComposition: formattedComposition // 将最终成分返回给前端
            };
            
            console.log("发送到前端的配方结果:", JSON.stringify(responseData, null, 2));

            res.json({
                code: 20000,
                data: responseData
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
    const { productName, targetAmount, recipe } = req.body;
    console.log('接收到执行生产请求:', { productName, targetAmount });

    if (!productName || !targetAmount || !recipe || recipe.length === 0) {
        return res.status(400).json({ code: 40001, message: '生产参数不完整。' });
    }

    const connection = await db.getConnection(); // 从连接池获取一个连接

    try {
        await connection.beginTransaction(); // 开始事务

        // 1. 检查库存并更新
        for (const item of recipe) {
            const requiredAmount = (targetAmount * item.percentage) / 100;
            const [rows] = await connection.query('SELECT stock_kg FROM waste_materials WHERE name = ? FOR UPDATE', [item.name]);
            
            if (rows.length === 0) {
                throw new Error(`未找到废料: ${item.name}`);
            }
            const currentStock = rows[0].stock_kg;
            if (currentStock < requiredAmount) {
                throw new Error(`废料库存不足: ${item.name} (需要 ${requiredAmount.toFixed(2)} kg, 现有 ${currentStock.toFixed(2)} kg)`);
            }

            const newStock = currentStock - requiredAmount;
            await connection.query('UPDATE waste_materials SET stock_kg = ? WHERE name = ?', [newStock, item.name]);
        }

        // 2. 创建生产记录
        const record = {
            id: `record_${new Date().getTime()}`,
            product_name: productName,
            actual_amount: targetAmount,
            unit: 'kg',
            production_time: new Date(),
            operator: 'System', // 这里可以根据实际登录用户替换
            quality_check: '待质检',
            quality_report: '', // 添加空的质检报告字段
            materials_used: JSON.stringify(recipe.map(item => ({
                name: item.name,
                amount: (targetAmount * item.percentage) / 100
            })))
        };

        await connection.query('INSERT INTO production_records SET ?', record);

        await connection.commit(); // 提交事务
        res.status(201).json({ code: 20000, message: '生产任务执行成功，库存已更新，生产记录已创建。' });

    } catch (error) {
        await connection.rollback(); // 回滚事务
        console.error('执行生产任务时出错:', error.message);
        res.status(500).json({ code: 50000, message: error.message || '服务器内部错误，执行生产失败。' });
    } finally {
        connection.release(); // 释放连接回连接池
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