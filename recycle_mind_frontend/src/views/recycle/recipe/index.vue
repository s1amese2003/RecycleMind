<template>
  <div class="app-container">
    <el-row :gutter="20">
      <!-- 左侧成品要求设置 -->
      <el-col :span="8">
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <span>成品要求设置</span>
          </div>

          <el-form ref="requirementForm" :model="requirement" label-position="top">
            <el-form-item label="成品名称">
              <el-select
                v-model="selectedProductId"
                placeholder="请选择或搜索成品"
                filterable
                style="width: 100%;"
                @change="onProductChange"
              >
                <el-option
                  v-for="item in products"
                  :key="item.id"
                  :label="item.model_number"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="目标产量 (kg)" prop="targetAmount">
              <el-input-number v-model="targetAmount" :min="1" controls-position="right" style="width: 100%;" />
            </el-form-item>

            <el-form-item label="元素含量要求 (%)">
              <div v-for="(element, index) in requirement.elements" :key="index" class="element-requirement">
                <el-row :gutter="10">
                  <el-col :span="6">
                    <el-input v-model="element.name" placeholder="元素" :disabled="true" />
                  </el-col>
                  <el-col :span="9">
                    <el-input-number
                      v-model="element.min"
                      :min="0"
                      :max="100"
                      :precision="5"
                      size="small"
                      placeholder="最小%"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </el-col>
                  <el-col :span="9">
                    <el-input-number
                      v-model="element.max"
                      :min="0"
                      :max="100"
                      :precision="5"
                      size="small"
                      placeholder="最大%"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </el-col>
                </el-row>
              </div>
            </el-form-item>

            <el-form-item label="排除废料（不可选）">
              <el-select
                v-model="excludedMaterials"
                multiple
                filterable
                placeholder="可选择一种或多种废料进行排除"
                style="width: 100%;"
              >
                <el-option
                  v-for="item in allWasteMaterials"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧配方计算结果 -->
      <el-col :span="16">
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <span>配方计算结果</span>
            <el-button
              style="float: right; margin-left: 10px;"
              type="primary"
              @click="handleCalculate"
              :loading="calculating"
              :disabled="!selectedProductId"
            >
              开始计算
            </el-button>
          </div>

          <div v-if="recipeResult && recipeResult.recipe">
            <el-alert
              v-if="isSuperAdmin"
              :title="'计算成功 - 预计最低成本: ¥' + recipeResult.totalCost.toFixed(2) + ' /kg'"
              type="success"
              show-icon
              :closable="false"
              style="margin-bottom: 20px"
            />

            <el-table
              :data="recipeResult.recipe"
              border
              style="width: 100%"
              show-summary
              :summary-method="getSummaries"
            >
              <el-table-column
                label="废料名称"
                prop="name"
                min-width="150"
              />
              <el-table-column
                label="存放区域"
                prop="storage_area"
                width="120"
                align="center"
              />
              <el-table-column
                label="配比"
                width="120"
                align="center"
              >
                <template slot-scope="{row}">
                  {{ row.percentage }} %
                </template>
              </el-table-column>
              <el-table-column
                label="需要用量 (kg)"
                width="150"
                align="center"
              >
                <template slot-scope="{row}">
                  {{ ((targetAmount * row.percentage) / 100).toFixed(2) }}
                </template>
              </el-table-column>
              <el-table-column
                v-if="isSuperAdmin"
                label="成本(元)"
                prop="cost"
                width="120"
                align="center"
              >
                <template slot-scope="{row}">
                  {{ (row.cost * targetAmount).toFixed(2) }}
                </template>
              </el-table-column>
            </el-table>

            <h4 style="margin-top: 30px; margin-bottom: 10px;">最终成品成分预览</h4>
            <el-table
              :data="finalCompositionForTable"
              border
              stripe
              style="width: 100%"
            >
              <el-table-column
                label="元素"
                prop="name"
                width="180"
                align="center"
              />
              <el-table-column
                label="预计含量 (%)"
                prop="percentage"
                align="center"
              >
                <template slot-scope="{row}">
                  <span>{{ row.percentage.toFixed(4) }} %</span>
                </template>
              </el-table-column>
            </el-table>

            <div style="margin-top: 20px; text-align: right;">
              <el-button
                type="success"
                icon="el-icon-check"
                @click="handleExecuteProduction"
                :loading="executing"
              >
                确认并执行生产
              </el-button>
            </div>

          </div>

          <div v-else class="empty-result">
            <el-empty description="请先选择成品，然后点击计算" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
import { getAllProducts } from '@/api/product'
import { calculateRecipe } from '@/api/recipe'
import { executeProduction } from '@/api/production'
import { getWasteMaterialList } from '@/api/waste-material'

const standardElements = ['Si', 'Fe', 'Cu', 'Mn', 'Mg', 'Cr', 'Zn', 'Ti', 'Ni', 'Zr', 'Sr', 'Na', 'Bi', 'Pb', 'B', 'AL'];

export default {
  name: 'Recipe',
  data() {
    return {
      products: [],
      allWasteMaterials: [],
      excludedMaterials: [],
      selectedProductId: null,
      targetAmount: 1000, // 默认目标产量
      requirement: {
        name: '',
        elements: []
      },
      calculating: false,
      executing: false,
      recipeResult: null
    }
  },
  computed: {
    isSuperAdmin() {
      return this.$store.getters.roles.includes('super_admin')
    },
    finalCompositionForTable() {
      if (!this.recipeResult || !this.recipeResult.finalComposition) {
        return []
      }
      // 将对象 { Si: 1, Fe: 2 } 转换为数组 [ { name: 'Si', percentage: 1 }, { name: 'Fe', percentage: 2 } ]
      const tableData = Object.entries(this.recipeResult.finalComposition).map(([name, percentage]) => ({
        name,
        percentage
      })).sort((a, b) => b.percentage - a.percentage) // 按含量降序排序
      return tableData;
    }
  },
  activated() {
    this.fetchProducts()
    this.fetchAllWasteMaterials()
  },
  methods: {
    fetchAllWasteMaterials() {
      getWasteMaterialList({ limit: 9999, page: 1 }).then(response => {
        this.allWasteMaterials = response.data.items
      }).catch(error => {
        this.$message.error('获取废料列表失败')
        console.error(error)
      })
    },
    fetchProducts() {
      getAllProducts().then(response => {
        this.products = response.data.items
      }).catch(error => {
        this.$message.error('获取产品列表失败')
        console.error(error)
      })
    },
    onProductChange(productId) {
      this.recipeResult = null // 清空上次的计算结果
      const selectedProduct = this.products.find(p => p.id === productId)
      if (!selectedProduct) return

      this.requirement.name = selectedProduct.model_number
      const elements = []
      // 将产品对象的元素结构转换为数组结构以用于表单
      standardElements.forEach(key => {
        if (selectedProduct[key]) {
          elements.push({
            name: key,
            min: selectedProduct[key].min || 0,
            max: selectedProduct[key].max || 0
          })
        }
      })
      this.requirement.elements = elements
    },
    handleCalculate() {
      this.calculating = true
      const requirementsForApi = {}
      this.requirement.elements.forEach(el => {
        if (el.min > 0 || el.max > 0) {
          requirementsForApi[el.name] = { min: el.min, max: el.max }
        }
      })

      calculateRecipe({ requirements: requirementsForApi, excluded_ids: this.excludedMaterials })
        .then(response => {
          this.recipeResult = response.data
          this.$message.success('配方计算成功！')
        })
        .catch(error => {
          this.$message.error('配方计算失败: ' + (error.response?.data?.message || error.message))
          this.recipeResult = null
        })
        .finally(() => {
          this.calculating = false
        })
    },
    getSummaries(param) {
      const { columns, data } = param;
      const sums = [];
      columns.forEach((column, index) => {
        if (index === 0) {
          sums[index] = '合计';
          return;
        }
        if (column.property === 'percentage') {
          const values = data.map(item => Number(item[column.property]));
          if (!values.every(value => isNaN(value))) {
            const sum = values.reduce((prev, curr) => {
              const value = Number(curr);
              if (!isNaN(value)) {
                return prev + curr;
              } else {
                return prev;
              }
            }, 0);
            sums[index] = sum.toFixed(2) + ' %';
          } else {
            sums[index] = 'N/A';
          }
        }
        if (column.label === '需要用量 (kg)') {
          const totalAmount = data.reduce((prev, curr) => {
            const amount = (this.targetAmount * curr.percentage) / 100;
            return prev + amount;
          }, 0);
          sums[index] = totalAmount.toFixed(2) + ' kg';
        }
        if (column.property === 'cost' && this.isSuperAdmin) {
           const totalCost = data.reduce((prev, curr) => prev + (curr.cost * this.targetAmount), 0);
           sums[index] = '¥ ' + totalCost.toFixed(2);
        }
      });
      return sums;
    },
    handleExecuteProduction() {
      if (!this.recipeResult || !this.recipeResult.recipe) {
        this.$message.error('没有可执行的配方。')
        return
      }

      const productionData = {
        productName: this.requirement.name,
        targetAmount: this.targetAmount,
        recipe: this.recipeResult.recipe.map(item => ({
          name: item.name,
          percentage: item.percentage
        }))
      }

      this.executing = true;
      executeProduction(productionData)
        .then(() => {
          this.$alert('生产任务已成功创建，相关废料库存已扣减。', '生产执行成功', {
            confirmButtonText: '确定',
            type: 'success'
          });
          this.recipeResult = null; // 清空结果，准备下一次计算
        })
        .catch(error => {
          this.$message.error('生产执行失败: ' + (error.response?.data?.message || error.message))
        })
        .finally(() => {
          this.executing = false;
        })
    }
  }
}
</script>

<style lang="scss" scoped>
.app-container {
  padding: 20px;
}
.box-card {
  margin-bottom: 20px;
}
.element-requirement {
  margin-bottom: 10px;
}
.empty-result {
  text-align: center;
  color: #909399;
  padding: 40px 0;
}
</style>
