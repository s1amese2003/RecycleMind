import request from '@/utils/request'

/**
 * 获取产品列表 (分页)
 * @param {object} params - 查询参数
 * @returns {AxiosPromise}
 */
export function fetchList(params) {
  return request({
    url: '/products',
    method: 'get',
    params
  })
}

/**
 * 获取所有产品名称列表
 * @returns {Promise}
 */
export function getProducts() {
  return request({
    url: '/products',
    method: 'get'
  })
}

/**
 * 获取所有产品名称列表（不分页）
 * @returns {Promise}
 */
export function getAllProducts() {
  return request({
    url: '/products',
    method: 'get'
  })
}

/**
 * 根据产品名称获取产品配方标准
 * @param {string} name 产品名称
 * @returns {AxiosPromise}
 */
export function getProductByName(name) {
  return request({
    url: '/product',
    method: 'get',
    params: { name }
  })
}

/**
 * 创建新产品
 * @param {object} data - 产品数据
 * @returns {AxiosPromise}
 */
export function createProduct(data) {
  return request({
    url: '/products',
    method: 'post',
    data
  })
}

/**
 * 更新产品信息
 * @param {number} id - 产品ID
 * @param {object} data - 产品数据
 * @returns {AxiosPromise}
 */
export function updateProduct(id, data) {
  return request({
    url: `/products/${id}`,
    method: 'put',
    data
  })
}

/**
 * 删除产品
 * @param {number} id - 产品ID
 * @returns {AxiosPromise}
 */
export function deleteProduct(id) {
  return request({
    url: `/products/${id}`,
    method: 'delete'
  })
}

/**
 * 获取所有原料的基础信息
 * @returns {AxiosPromise}
 */
export function getMaterials() {
  return request({
    url: '/materials',
    method: 'get'
  })
}

/**
 * 执行配方计算
 * @param {object} data - 计算所需的参数
 * @returns {Promise}
 */
export function calculateRecipe(data) {
  return request({
    url: '/calculate',
    method: 'post',
    data
  })
}
