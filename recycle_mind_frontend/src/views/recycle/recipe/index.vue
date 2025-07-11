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

const standardElements = ['Si', 'Fe', 'Cu', 'Mn', 'Mg', 'Cr', 'Zn', 'Ti', 'Ni', 'Zr', 'Sr', 'Na', 'Bi', 'Pb', 'B', 'AL'];

export default {
  name: 'Recipe',
  data() {
    return {
      products: [],
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
    finalCompositionForTable() {
      if (!this.recipeResult || !this.recipeResult.finalComposition) {
        console.log('finalCompositionForTable: recipeResult.finalComposition 不可用');
        return []
      }
      // 将对象 { Si: 1, Fe: 2 } 转换为数组 [ { name: 'Si', percentage: 1 }, { name: 'Fe', percentage: 2 } ]
      const tableData = Object.entries(this.recipeResult.finalComposition).map(([name, percentage]) => ({
        name,
        percentage
      })).sort((a, b) => b.percentage - a.percentage) // 按含量降序排序
      console.log('finalCompositionForTable 已转换数据:', tableData);
      return tableData;
    }
  },
  activated() {
    this.fetchProducts()
  },
  methods: {
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
      if (!this.selectedProductId) {
        this.$message.warning('请先选择一个成品')
        return
      }
      if (!this.targetAmount || this.targetAmount <= 0) {
        this.$message.warning('请输入一个有效的目标产量')
        return
      }

      this.calculating = true
      this.recipeResult = null

      // 将表单的数组结构转换回API需要的对象结构
      const requirementsPayload = {}
      this.requirement.elements.forEach(el => {
        if (el.name) {
          requirementsPayload[el.name] = {
            min: el.min,
            max: el.max
          }
        }
      })

      calculateRecipe({ requirements: requirementsPayload }).then(response => {
        console.log('从后端接收到的配方结果:', JSON.stringify(response.data, null, 2));
        this.recipeResult = response.data
        this.$notify({
          title: '成功',
          message: '配方计算成功!',
          type: 'success'
        })
      }).catch(error => {
        this.$message.error('计算失败，无法找到满足条件的配方')
        console.error(error)
      }).finally(() => {
        this.calculating = false
      })
    },
    getSummaries(param) {
      const { columns, data } = param;
      const sums = [];
      columns.forEach((column, index) => {
        if (index === 0) {
          sums[index] = '总计';
          return;
        }

        // 新增：跳过“存放区域”列的计算
        if (column.property === 'storage_area') {
          sums[index] = '';
          return;
        }

        // 对“配比”列进行求和
        if (column.property === 'percentage') {
          const values = data.map(item => Number(item.percentage));
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
          return;
        }

        // 对“需要用量”列进行求和 (通过列标题识别)
        if (column.label === '需要用量 (kg)') {
          const values = data.map(item => Number(((this.targetAmount * item.percentage) / 100)));
          if (!values.every(value => isNaN(value))) {
            const sum = values.reduce((prev, curr) => {
              const value = Number(curr);
              if (!isNaN(value)) {
                return prev + curr;
              } else {
                return prev;
              }
            }, 0);
            sums[index] = sum.toFixed(2) + ' kg';
          } else {
            sums[index] = 'N/A';
          }
          return;
        }

        // 对“成本”列进行求和
        if (column.property === 'cost') {
          const values = data.map(item => Number(item.cost));
          if (!values.every(value => isNaN(value))) {
            const sum = values.reduce((prev, curr) => {
              const value = Number(curr);
              if (!isNaN(value)) {
                return prev + curr;
              } else {
                return prev;
              }
            }, 0);
            sums[index] = (sum * this.targetAmount).toFixed(2);
          } else {
            sums[index] = 'N/A';
          }
          return;
        }

        sums[index] = '';
      });

      return sums;
    },
    handleExecuteProduction() {
      if (!this.recipeResult || !this.recipeResult.recipe) {
        this.$message.warning('请先进行配方计算，然后执行生产')
        return
      }
      this.$confirm('此操作将从业仓库扣减所需物料，并创建一条生产记录。是否确定执行？', '生产确认', {
        confirmButtonText: '确定执行',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.executing = true;
        const payload = {
          productName: this.requirement.name,
          targetAmount: this.targetAmount,
          recipe: this.recipeResult.recipe
        };
        executeProduction(payload).then(response => {
          this.$message.success('生产任务已成功执行！')
          this.recipeResult = null // 清空结果，准备下一次计算
          this.$bus.$emit('production-executed')
        }).catch(error => {
          this.$message.error('生产执行失败，请重试')
          console.error('Production execution failed:', error)
        }).finally(() => {
          this.executing = false;
        });
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '已取消执行'
        });
      });
    }
  }
}
</script>

<style scoped>
.element-requirement {
  margin-bottom: 10px;
}
.empty-result {
  text-align: center;
  margin-top: 50px;
}
</style>
