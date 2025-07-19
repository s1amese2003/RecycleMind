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

            <el-form-item label="启用安全余量">
              <el-switch
                v-model="enableSafetyMargin"
                active-text="开启"
                inactive-text="关闭"
              />
              <el-tooltip content="开启后，计算结果将在满足标准的基础上，为各元素含量保留一定的安全空间，避免微小波动导致出品不合格。" placement="top">
                <i class="el-icon-question" style="margin-left: 10px; color: #909399;" />
              </el-tooltip>
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

            <el-form-item label="必选废料（必须选）">
              <el-select
                v-model="mustSelectMaterials"
                multiple
                filterable
                placeholder="可选择一种或多种废料进行必选"
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
            <el-alert
              v-if="validationResult.message"
              :title="validationResult.message"
              :type="validationResult.type"
              show-icon
              :closable="false"
              style="margin-bottom: 20px"
            />

            <el-table
              :data="editableRecipe"
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
                  {{ row.percentage.toFixed(2) }} %
                </template>
              </el-table-column>
              <el-table-column
                label="实际用量 (kg)"
                width="180"
                align="center"
              >
                <template slot-scope="{row}">
                  <el-input-number
                    v-model="row.actual_amount"
                    :min="0"
                    :step="1"
                    :precision="2"
                    size="small"
                    controls-position="right"
                    style="width: 100%"
                    @change="onAmountChange"
                  />
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
                  {{ row.cost.toFixed(2) }}
                </template>
              </el-table-column>
            </el-table>

            <div style="margin-top: 20px; text-align: left;">
              <el-button type="info" @click="handleValidateRecipe">
                <i class="el-icon-s-check" /> 检验当前方案
              </el-button>
              <el-button type="warning" @click="handleResetRecipe">
                <i class="el-icon-refresh-left" /> 重置为推荐方案
              </el-button>
            </div>

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
                  <span>{{ row.percentage.toFixed(3) }} %</span>
                </template>
              </el-table-column>
              <el-table-column
                label="生产标准 (%)"
                align="center"
              >
                <template slot-scope="{row}">
                  <span v-if="getRequirementForElement(row.name)">
                    {{ getRequirementForElement(row.name).min }} - {{ getRequirementForElement(row.name).max }}
                  </span>
                  <span v-else>N/A</span>
                </template>
              </el-table-column>
              <el-table-column
                label="检验结果"
                align="center"
                width="120"
              >
                <template slot-scope="{row}">
                  <el-tag :type="row.status === '合格' ? 'success' : (row.status === '不合格' ? 'danger' : 'info')">
                    {{ row.status }}
                  </el-tag>
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
      mustSelectMaterials: [],
      selectedProductId: null,
      targetAmount: 1000, // 默认目标产量
      requirement: {
        name: '',
        elements: []
      },
      calculating: false,
      executing: false,
      recipeResult: null,
      editableRecipe: [], // 用于可编辑的配方
      isDirty: false, // 方案是否被手动修改过
      validationResult: { // 用于存储检验结果
        message: '',
        type: 'info'
      },
      enableSafetyMargin: true // 默认开启安全余量
    }
  },
  computed: {
    isSuperAdmin() {
      return this.$store.getters.roles.includes('super_admin')
    },
    username() {
      return this.$store.getters.name
    },
    finalCompositionForTable() {
      // 如果方案没有被手动修改过，并且有后端返回的精确结果，则直接使用后端结果
      if (!this.isDirty && this.recipeResult && this.recipeResult.finalComposition) {
        return Object.entries(this.recipeResult.finalComposition).map(([name, percentage]) => {
          const req = this.getRequirementForElement(name);
          let status = '无要求';
          if (req) {
            // 增加精度处理来避免浮点数比较问题
            const p = parseFloat(percentage.toFixed(3));
            const min = parseFloat(req.min.toFixed(3));
            const max = parseFloat(req.max.toFixed(3));
            const tolerance = 0.0001; // 定义容差

            if (p >= (min - tolerance) && p <= (max + tolerance)) {
              status = '合格';
            } else {
              status = '不合格';
            }
          }
          return { name, percentage, status };
        }).sort((a, b) => b.percentage - a.percentage);
      }

      // 如果方案被修改过，或者没有后端结果，则进行前端实时计算
      const source = this.editableRecipe;
      if (source.length === 0) return [];

      const finalComposition = {};
      let totalEffectiveAmount = 0; // 产出物总重量

      source.forEach(recipeItem => {
        const materialDetails = this.allWasteMaterials.find(m => m.id === recipeItem.id);
        if (materialDetails) {
          const yieldRate = (parseFloat(materialDetails.yield_rate) || 100) / 100;
          totalEffectiveAmount += recipeItem.actual_amount * yieldRate; // 累计有效产出
        }
      });

      if (totalEffectiveAmount === 0) return [];

      source.forEach(recipeItem => {
        const materialDetails = this.allWasteMaterials.find(m => m.id === recipeItem.id);
        if (materialDetails && materialDetails.composition) {
          const composition = materialDetails.composition;
          const yieldRate = (parseFloat(materialDetails.yield_rate) || 100) / 100;

          for (const el in composition) {
            if (!finalComposition[el]) finalComposition[el] = 0;
            // 元素贡献(kg) = 原料投入量(kg) * 出水率 * 元素在原料中的含量(%)
            finalComposition[el] += recipeItem.actual_amount * yieldRate * (composition[el] / 100);
          }
        }
      });

      // 将元素的绝对重量(kg)转换为在最终成品中的百分比
      const tableData = Object.entries(finalComposition).map(([name, absoluteAmount]) => {
        const percentage = (absoluteAmount / totalEffectiveAmount) * 100;
        const req = this.getRequirementForElement(name);
        let status = '无要求';
        if (req) {
          // 增加精度处理来避免浮点数比较问题
          const p = parseFloat(percentage.toFixed(3));
          const min = parseFloat(req.min.toFixed(3));
          const max = parseFloat(req.max.toFixed(3));
          const tolerance = 0.0001; // 定义容差

          if (p >= (min - tolerance) && p <= (max + tolerance)) {
            status = '合格';
          } else {
            status = '不合格';
          }
        }
        return { name, percentage, status };
      }).sort((a, b) => b.percentage - a.percentage); // 按含量降序排序

      return tableData;
    }
  },
  created() {
    this.fetchProducts()
    this.fetchAllWasteMaterials()
  },
  methods: {
    getRequirementForElement(elementName) {
      return this.requirement.elements.find(el => el.name === elementName);
    },
    onAmountChange() {
      this.isDirty = true; // 标记方案已被修改
      // 当用量改变时，重置检验结果，提示用户需要重新检验
      this.validationResult = { message: '配方已修改，请重新检验。', type: 'warning' };

      // 重新计算配比和成本
      const totalAmount = this.editableRecipe.reduce((sum, item) => sum + item.actual_amount, 0);
      if (totalAmount > 0) {
        this.editableRecipe.forEach(item => {
          const materialDetails = this.allWasteMaterials.find(m => m.id === item.id);
          item.percentage = (item.actual_amount / totalAmount) * 100;
          item.cost = item.actual_amount * (parseFloat(materialDetails.unit_price) || 0);
        });
      }
    },
    handleResetRecipe() {
      this.initEditableRecipe();
      this.isDirty = false; // 重置时，恢复为未修改状态
      this.$message.success('已重置为系统推荐方案');
      this.validationResult = { message: '', type: 'info' };
    },
    handleValidateRecipe() {
      const results = this.finalCompositionForTable;
      const isAllPass = results.every(item => item.status === '合格' || item.status === '无要求');

      if (isAllPass) {
        this.validationResult = { message: '检验通过！当前方案满足所有生产要求。', type: 'success' };
      } else {
        this.validationResult = { message: '检验不通过！部分元素含量未达到标准。', type: 'error' };
      }
      this.$message({
        message: this.validationResult.message,
        type: this.validationResult.type
      });
    },
    fetchAllWasteMaterials() {
      getWasteMaterialList({ limit: 9999, page: 1 }).then(response => {
        this.allWasteMaterials = response.data.items.map(item => {
          // 确保 composition 是一个对象
          if (typeof item.composition === 'string') {
            try {
              item.composition = JSON.parse(item.composition);
            } catch (e) {
              console.error(`Failed to parse composition for material ${item.id}:`, item.composition);
              item.composition = {};
            }
          }
          return item;
        });
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
            min: parseFloat(selectedProduct[key].min) || 0,
            max: parseFloat(selectedProduct[key].max) || 0
          })
        }
      })
      this.requirement.elements = elements
    },
    async handleCalculate() {
      this.calculating = true
      try {
          const payload = {
              requirements: this.requirement.elements.reduce((acc, el) => {
                  acc[el.name] = { min: el.min, max: el.max }
                  return acc
              }, {}),
              excluded_ids: this.excludedMaterials,
              must_select_ids: this.mustSelectMaterials,
              enable_safety_margin: false // 禁用安全余量
          }
          const { data } = await calculateRecipe(payload)
          this.recipeResult = data
          this.initEditableRecipe(); // 初始化可编辑的配方
          this.isDirty = false; // 计算成功后，方案是“干净”的
          this.validationResult = { message: '', type: 'info' }; // 清空之前的检验结果
          this.$message.success('配方计算成功！')
      } catch (error) {
          this.$message.error('配方计算失败: ' + (error.response?.data?.message || error.message))
          this.recipeResult = null
      } finally {
          this.calculating = false
      }
    },
    initEditableRecipe() {
      if (!this.recipeResult || !this.recipeResult.recipe) {
        this.editableRecipe = [];
        return;
      }
      // 后端返回的是基于1kg产成品的配方，我们需要根据目标产量进行缩放
      const scale = this.targetAmount;

      this.editableRecipe = this.recipeResult.recipe.map(item => {
        const materialDetails = this.allWasteMaterials.find(m => m.id === item.id);
        const actual_amount = item.weight * scale; // weight是1kg成品所需原料(kg)

        return {
          ...item,
          // 根据目标产量，等比放大各项数值
          actual_amount: parseFloat(actual_amount.toFixed(2)),
          cost: actual_amount * (parseFloat(materialDetails.unit_price) || 0)
        };
      });
    },
    getSummaries(param) {
      const { columns, data } = param;
      const sums = [];
      columns.forEach((column, index) => {
        if (index === 0) {
          sums[index] = '合计';
          return;
        }
        // 对配比进行合计
        if (column.property === 'percentage') {
          const values = data.map(item => Number(item.percentage));
          const sum = values.reduce((prev, curr) => prev + curr, 0);
          sums[index] = sum.toFixed(2) + ' %';
          return;
        }
        // 对实际用量进行合计
        if (column.label === '实际用量 (kg)') {
          const values = data.map(item => Number(item.actual_amount));
          const sum = values.reduce((prev, curr) => prev + curr, 0);
          sums[index] = sum.toFixed(2) + ' kg';
          return;
        }
        // 对成本进行合计
        if (column.property === 'cost' && this.isSuperAdmin) {
           const totalCost = data.reduce((prev, curr) => prev + curr.cost, 0);
           sums[index] = '¥ ' + totalCost.toFixed(2);
           return;
        }
      });
      return sums;
    },
    handleExecuteProduction() {
      if (!this.recipeResult || !this.recipeResult.recipe) {
        this.$message.error('没有可执行的配方。')
        return
      }

      this.handleValidateRecipe() // 在执行前再次检验
      if (this.validationResult.type !== 'success') {
        this.$confirm('当前方案未通过检验或尚未检验，确定要执行吗?', '提示', {
          confirmButtonText: '确定执行',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          this.proceedWithProduction();
        }).catch(() => {
          // 用户取消
        });
      } else {
        this.proceedWithProduction();
      }
    },
    proceedWithProduction() {
      const productionData = {
        productName: this.requirement.name,
        targetAmount: this.editableRecipe.reduce((sum, item) => sum + item.actual_amount, 0),
        recipe: this.editableRecipe.map(item => ({
          id: item.id,
          name: item.name,
          percentage: item.percentage
        })),
        operator: this.username // 传递当前用户名
      }

      this.executing = true;
      executeProduction(productionData)
        .then((response) => {
          this.$alert(response.data.message || '生产计划已成功创建，等待审批。', '操作成功', {
            confirmButtonText: '确定',
            type: 'success',
            callback: () => {
              this.recipeResult = null; // 清空结果，准备下一次计算
              this.editableRecipe = [];
            }
          });
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
