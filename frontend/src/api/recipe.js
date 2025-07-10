import request from '@/utils/request'

export function getRecipeMaterials(params) {
  return request({
    url: '/recipe/materials',
    method: 'get',
    params
  })
}

export function calculateRecipe(data) {
  return request({
    url: '/recipe/calculate',
    method: 'post',
    data
  })
}
