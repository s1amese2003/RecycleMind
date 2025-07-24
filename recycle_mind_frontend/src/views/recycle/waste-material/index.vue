<template>
  <div class="app-container">
    <div class="filter-container">
      <el-input
        v-model="listQuery.keyword"
        placeholder="废料名称/存放区域"
        style="width: 200px;"
        class="filter-item"
        @keyup.enter.native="handleFilter"
      />
      <el-button v-waves class="filter-item" type="primary" icon="el-icon-search" @click="handleFilter">
        搜索
      </el-button>
      <el-button
        class="filter-item"
        style="margin-left: 10px;"
        type="primary"
        icon="el-icon-plus"
        @click="handleCreate"
        v-if="!isApprover"
      >
        添加废料
      </el-button>
      <el-button v-waves :loading="downloadLoading" class="filter-item" type="primary" icon="el-icon-download" @click="handleDownload">
        导出
      </el-button>
      <el-button
        class="filter-item"
        style="margin-left: 10px;"
        type="success"
        icon="el-icon-upload2"
        @click="handleImportClick"
        v-if="isSuperAdmin"
      >
        导入
      </el-button>
      <el-button
        v-waves
        class="filter-item"
        type="danger"
        icon="el-icon-delete"
        @click="handleBatchDelete"
        :disabled="selectedWasteMaterials.length === 0"
        v-if="isSuperAdmin"
      >
        批量删除
      </el-button>
      <el-button
        v-waves
        class="filter-item"
        type="danger"
        icon="el-icon-delete"
        @click="handleDeleteAll"
        v-if="isSuperAdmin"
        style="margin-left: 10px;"
      >
        删除所有
      </el-button>
    </div>

    <el-table
      :key="tableKey"
      v-loading="listLoading"
      :data="list"
      border
      fit
      highlight-current-row
      style="width: 100%;"
      @selection-change="handleSelectionChange"
      ref="multipleTable"
    >
      <el-table-column
        type="selection"
        width="55">
      </el-table-column>
      <el-table-column label="废料编号" prop="id" align="center" width="100" v-if="false" />

      <el-table-column label="废料名称" min-width="150px">
        <template slot-scope="{row}">
          <span class="link-type" @click="handleUpdate(row)">{{ row.name }}</span>
        </template>
      </el-table-column>

      <el-table-column label="存放区域" width="120px" align="center">
        <template slot-scope="{row}">
          <span>{{ row.storage_area }}</span>
        </template>
      </el-table-column>

      <el-table-column label="库存" width="120px" align="center">
        <template slot-scope="{row}">
          <span>{{ row.stock_kg }} kg</span>
        </template>
      </el-table-column>

      <el-table-column label="单价" width="120px" align="center" v-if="!isAdmin && !isApprover">
        <template slot-scope="{row}">
          <span>{{ row.unit_price }} 元/kg</span>
        </template>
      </el-table-column>

      <el-table-column label="出水率" width="120px" align="center">
        <template slot-scope="{row}">
          <span v-if="row.yield_rate !== null && row.yield_rate !== undefined">{{ row.yield_rate }} %</span>
          <span v-else>--</span>
        </template>
      </el-table-column>

      <el-table-column label="实际单价" width="120px" align="center" v-if="!isAdmin && !isApprover">
        <template slot-scope="{row}">
          <span v-if="row.actual_unit_price !== null && row.actual_unit_price !== undefined">
            {{ parseFloat(row.actual_unit_price || 0).toFixed(2) }} 元/kg
          </span>
          <span v-else>--</span>
        </template>
      </el-table-column>

      <el-table-column label="成分构成" min-width="250px" align="left">
        <template slot-scope="{row}">
          <div style="display: flex; flex-wrap: wrap;">
            <el-tag
              v-for="(value, key) in row.composition"
              :key="key"
              size="mini"
              style="margin-right: 5px; margin-bottom: 5px;"
            >
              {{ key }}: {{ value }}%
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" align="center" width="230" class-name="small-padding fixed-width">
        <template slot-scope="{row, index}">
          <el-button type="primary" size="mini" @click="handleUpdate(row)" v-if="!isApprover">
            编辑
          </el-button>
          <el-button size="mini" type="success" @click="handleStock(row)" v-if="!isApprover">
            库存变更
          </el-button>
          <el-button size="mini" type="danger" @click="handleDelete(row, index)" v-if="!isApprover && isSuperAdmin">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="total>0"
      :total="total"
      :page.sync="listQuery.page"
      :limit.sync="listQuery.limit"
      @pagination="getList"
    />

    <!-- 导入废料对话框 -->
    <el-dialog title="导入废料" :visible.sync="importDialogVisible" width="600px">
      <el-upload
        class="upload-demo"
        drag
        action="#"
        :show-file-list="false"
        :before-upload="beforeUpload"
        :http-request="handleReadExcel"
        accept=".xlsx, .xls"
      >
        <i class="el-icon-upload"></i>
        <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
        <div class="el-upload__tip" slot="tip">只能上传 xls/xlsx 文件</div>
      </el-upload>
      <div v-if="excelData.length > 0" style="margin-top: 20px;">
        <el-alert
          :title="`已读取 ${excelData.length} 条数据，请确认。`"
          type="success"
          show-icon
          :closable="false"
        ></el-alert>
        <el-button type="primary" style="margin-top: 10px;" @click="uploadExcelData">
          确认导入
        </el-button>
      </div>
    </el-dialog>

    <!-- 废料编辑/新增对话框 -->
    <el-dialog :title="dialogStatus === 'create' ? '添加废料' : '编辑废料'" :visible.sync="dialogFormVisible">
      <el-form
        ref="dataForm"
        :rules="rules"
        :model="temp"
        label-position="left"
        label-width="100px"
        style="width: 600px; margin-left:50px;"
      >
        <el-form-item label="废料名称" prop="name">
          <el-input v-model="temp.name" />
        </el-form-item>

        <el-form-item label="存放区域" prop="storage_area">
          <el-input v-model="temp.storage_area" />
        </el-form-item>

        <el-form-item label="库存(kg)" prop="stock_kg">
          <el-input-number v-model="temp.stock_kg" :min="0" />
        </el-form-item>

        <el-form-item label="单价(元/kg)" prop="unit_price" v-if="!isAdmin">
          <el-input-number v-model="temp.unit_price" :min="0" :precision="2" />
        </el-form-item>

        <el-form-item label="出水率(%)" prop="yield_rate">
          <el-input-number v-model="temp.yield_rate" :min="0" :max="100" :precision="2" />
        </el-form-item>

        <el-form-item label="实际单价(元/kg)" v-if="!isAdmin">
          <el-input :value="actualUnitPrice" :disabled="true" />
        </el-form-item>

        <el-form-item label="成分构成">
          <el-row :gutter="15">
            <el-col v-for="element in temp.elements" :key="element.name" :span="12">
              <div class="composition-item">
                <span class="element-name">{{ element.name }}</span>
                <el-input-number
                  v-model="element.percentage"
                  :min="0"
                  :max="100"
                  :precision="4"
                  size="small"
                  controls-position="right"
                  style="flex-grow: 1;"
                />
                <span class="percentage-sign">%</span>
              </div>
            </el-col>
          </el-row>
        </el-form-item>
      </el-form>

      <div slot="footer" class="dialog-footer">
        <el-button @click="dialogFormVisible = false">
          取消
        </el-button>
        <el-button type="primary" @click="dialogStatus==='create'?createData():updateData()">
          确认
        </el-button>
      </div>
    </el-dialog>

    <!-- 库存变更对话框 -->
    <el-dialog title="库存变更" :visible.sync="stockDialogVisible">
      <el-form
        ref="stockForm"
        :model="stockForm"
        label-position="left"
        label-width="100px"
        style="width: 400px; margin-left:50px;"
      >
        <el-form-item label="变更类型">
          <el-radio-group v-model="stockForm.type">
            <el-radio label="in">入库</el-radio>
            <el-radio label="out">出库</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="变更数量">
          <el-input-number v-model="stockForm.amount" :min="1" />
        </el-form-item>

        <el-form-item label="变更原因">
          <el-input type="textarea" v-model="stockForm.reason" />
        </el-form-item>
      </el-form>

      <div slot="footer" class="dialog-footer">
        <el-button @click="stockDialogVisible = false">
          取消
        </el-button>
        <el-button type="primary" @click="updateStock">
          确认
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import waves from '@/directive/waves' // waves directive
import Pagination from '@/components/Pagination' // secondary package based on el-pagination
import { getWasteMaterialList, createWasteMaterial, updateWasteMaterial, deleteWasteMaterial, importWasteMaterials, batchDeleteWasteMaterials, deleteAllWasteMaterials } from '@/api/waste-material'
import * as XLSX from 'xlsx' // 导入 XLSX 库

const standardElements = ['Si', 'Fe', 'Cu', 'Mn', 'Mg', 'Cr', 'Zn', 'Ti', 'Ni', 'Zr', 'Sr', 'Na', 'Bi', 'Pb', 'B', 'AL'];

// Helper function to convert elements array to composition object
function elementsToComposition(elements) {
  if (!Array.isArray(elements)) return {}
  return elements.reduce((acc, element) => {
    if (element.name && element.percentage > 0) {
      acc[element.name] = parseFloat(element.percentage) || 0
    }
    return acc
  }, {})
}

export default {
  name: 'WasteMaterial',
  components: { Pagination },
  directives: { waves },
  computed: {
    actualUnitPrice() {
      const { unit_price, yield_rate } = this.temp
      if (typeof unit_price === 'number' && typeof yield_rate === 'number' && yield_rate > 0) {
        return (unit_price / (yield_rate / 100)).toFixed(2)
      }
      return '0.00'
    },
    roles() {
      return this.$store.getters && this.$store.getters.roles ? this.$store.getters.roles : []
    },
    isSuperAdmin() {
      return this.roles.includes('super_admin')
    },
    isAdmin() {
      return this.roles.includes('admin')
    },
    isApprover() {
      return this.roles.includes('approver')
    }
  },
  data() {
    return {
      tableKey: 0,
      list: null,
      total: 0,
      listLoading: true,
      listQuery: {
        page: 1,
        limit: 20,
        keyword: undefined,
        type: undefined
      },
      temp: {
        id: undefined,
        name: '',
        storage_area: '',
        stock_kg: 0,
        unit_price: 0,
        yield_rate: 100,
        elements: []
      },
      dialogFormVisible: false,
      dialogStatus: '',
      stockDialogVisible: false,
      stockForm: {
        id: null,
        type: 'in',
        amount: 1,
        reason: ''
      },
      downloadLoading: false,
      rules: {
        name: [{ required: true, message: '请输入废料名称', trigger: 'blur' }],
        storage_area: [{ required: true, message: '请输入存放区域', trigger: 'blur' }]
      },
      importDialogVisible: false,
      excelData: [],
      selectedWasteMaterials: [] // 新增：用于存储选中的废料
    }
  },
  activated() {
    this.getList()
  },
  created() {
    this.defaultElements = standardElements.map(name => ({ name, percentage: 0 }))
  },
  methods: {
    getList() {
      this.listLoading = true
      getWasteMaterialList(this.listQuery).then(response => {
        console.log("获取废料列表响应数据:", response.data.items); // 添加这行日志
        this.list = response.data.items.map(item => {
          if (item.composition && typeof item.composition === 'string') {
            item.composition = JSON.parse(item.composition)
          }
          if (item.unit_price && item.yield_rate) {
            item.actual_unit_price = item.unit_price / (item.yield_rate / 100);
          }
          return item
        })
        this.total = response.data.total
        this.listLoading = false
      })
    },
    handleFilter() {
      this.listQuery.page = 1
      this.getList()
    },
    handleCreate() {
      this.temp = {
        id: undefined,
        name: '',
        storage_area: '',
        stock_kg: 0,
        unit_price: 0,
        yield_rate: 100,
        elements: JSON.parse(JSON.stringify(this.defaultElements))
      }
      this.dialogStatus = 'create'
      this.dialogFormVisible = true
      this.$nextTick(() => {
        this.$refs['dataForm'].clearValidate()
      })
    },
    createData() {
      this.$refs['dataForm'].validate((valid) => {
        if (valid) {
          const tempData = this.prepareTempData()
          createWasteMaterial(tempData).then(() => {
            this.getList()
            this.dialogFormVisible = false
            this.$notify({
              title: '成功',
              message: '创建成功',
              type: 'success',
              duration: 2000
            })
          })
        }
      })
    },
    handleUpdate(row) {
      this.temp = {
        ...row,
        elements: this.compositionToElements(row.composition)
      }
      if (this.temp.yield_rate === null || this.temp.yield_rate === undefined) {
        this.temp.yield_rate = 100
      }
      this.dialogStatus = 'update'
      this.dialogFormVisible = true
      this.$nextTick(() => {
        this.$refs['dataForm'].clearValidate()
      })
    },
    updateData() {
      this.$refs['dataForm'].validate((valid) => {
        if (valid) {
          const tempData = this.prepareTempData()
          updateWasteMaterial(tempData.id, tempData).then(() => {
            this.getList()
            this.dialogFormVisible = false
            this.$notify({
              title: '成功',
              message: '更新成功',
              type: 'success',
              duration: 2000
            })
          })
        }
      })
    },
    handleDelete(row, index) {
      console.log("尝试删除废料:", row); // 添加这行日志
      console.log("删除废料ID:", row.id); // 添加这行日志
      this.$confirm('确定要删除这个废料吗？', '警告', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async() => {
        try {
          await deleteWasteMaterial(row.id)
          // 确保 getList() 完成后再显示成功通知
          await this.getList() // 确保这里的 await
          this.$notify({
            title: '成功',
            message: '删除成功',
            type: 'success',
            duration: 2000
          })
        } catch (error) {
          this.$notify({
            title: '失败',
            message: '删除失败',
            type: 'error',
            duration: 2000
          })
        }
      })
    },
    handleStock(row) {
      this.temp = Object.assign({}, row) // copy obj
      this.stockForm.id = row.id
      this.stockDialogVisible = true
    },
    updateStock() {
      const currentItem = this.list.find(item => item.id === this.stockForm.id)
      if (!currentItem) {
        this.$message.error('未找到要更新的物料！')
        return
      }

      let newStock = Number(currentItem.stock_kg)
      const changeAmount = Number(this.stockForm.amount)

      if (this.stockForm.type === 'in') {
        newStock += changeAmount
      } else {
        newStock -= changeAmount
        if (newStock < 0) {
          this.$message.error('出库数量不能大于当前库存！')
          return
        }
      }

      const postData = { ...currentItem, stock_kg: newStock }

      updateWasteMaterial(postData.id, postData).then(() => {
        this.getList() // Refresh list
        this.stockDialogVisible = false
        this.$notify({
          title: '成功',
          message: '库存更新成功',
          type: 'success',
          duration: 2000
        })
      })
    },
    handleDownload() {
      this.downloadLoading = true
      import('@/vendor/Export2Excel').then(excel => {
        try {
          let tHeader = ['废料编号', '废料名称', '存放区域', '库存(kg)', '出水率(%)', '成分构成'];
          let filterVal = ['id', 'name', 'storage_area', 'stock_kg', 'yield_rate', 'composition'];

          // 如果是超级管理员，则包含单价和实际单价
          if (this.isSuperAdmin) {
            tHeader.splice(4, 0, '单价(元/kg)', '实际单价(元/kg)');
            filterVal.splice(4, 0, 'unit_price', 'actual_unit_price');
          }

          // 移除废料编号列
          const idIndex = tHeader.indexOf('废料编号');
          if (idIndex > -1) {
            tHeader.splice(idIndex, 1);
            filterVal.splice(idIndex, 1);
          }

          const data = this.formatJson(filterVal, this.list)
          excel.export_json_to_excel({
            header: tHeader,
            data,
            filename: '废料列表'
          })
        } catch (e) {
          console.error(e)
        } finally {
          this.downloadLoading = false
        }
      })
    },
    formatJson(filterVal, jsonData) {
      return jsonData.map(v => filterVal.map(j => {
        if (j === 'composition') {
          return JSON.stringify(v[j])
        }
        return v[j]
      }))
    },
    compositionToElements(composition) {
      let parsedComposition = composition;
      if (typeof composition === 'string') {
        try {
          parsedComposition = JSON.parse(composition);
        } catch (e) {
          console.error("解析成分构成JSON字符串失败:", e);
          return []; // 解析失败返回空数组
        }
      }

      if (parsedComposition && typeof parsedComposition === 'object') {
        return standardElements.map(name => ({
          name,
          percentage: parsedComposition[name] || 0
        }))
      }
      return []
    },
    prepareTempData() {
      const tempData = Object.assign({}, this.temp)
      tempData.composition = elementsToComposition(tempData.elements)
      tempData.actual_unit_price = this.actualUnitPrice
      delete tempData.elements
      return tempData
    },
    handleImportClick() {
      this.importDialogVisible = true
      this.excelData = [] // Clear previous data
    },
    beforeUpload(file) {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel';
      if (!isExcel) {
        this.$message.error('只能上传 xls/xlsx 文件!');
      }
      return isExcel;
    },
    handleReadExcel(options) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const workbook = XLSX.read(event.target.result, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);
          console.log("Excel 解析后的原始数据:", data[0]); // 添加这行日志，打印第一个对象，查看键名
          this.excelData = data;
        } catch (e) {
          this.$message.error('导入失败，请检查文件格式或内容！');
          console.error(e);
        }
      };
      reader.readAsArrayBuffer(options.file);
    },
    async uploadExcelData() { // 将这里修改为 async
      if (this.excelData.length === 0) {
        this.$message.warning('请先导入Excel文件！');
        return;
      }

      const wasteMaterials = this.excelData.map(item => {
        const wasteMaterial = {
          name: item['废料名称'],
          storage_area: item['存放区域'],
          stock_kg: item['库存(kg)'], // 修改为方括号访问
          unit_price: item['单价(元/kg)'], // 修改为方括号访问
          yield_rate: item['出水率(%)'], // 修改为方括号访问
          // 实际单价不需要从 Excel 中导入，因为它是根据单价和出水率计算的
          composition: elementsToComposition(this.compositionToElements(item['成分构成'])) // 修改为方括号访问
        };
        return wasteMaterial;
      });

      let successCount = 0;
      let failedCount = 0;
      const failedItems = [];

      const results = await Promise.allSettled(wasteMaterials.map(wasteMaterial => createWasteMaterial(wasteMaterial)));

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
        } else {
          failedCount++;
          failedItems.push({
            name: wasteMaterials[index].name,
            error: result.reason ? result.reason.message : '未知错误'
          });
        }
      });

      this.$message({
        type: 'success',
        message: `导入成功 ${successCount} 条，失败 ${failedCount} 条。`
      });
      this.importDialogVisible = false;
      this.excelData = [];
      await this.getList(); // 确保获取到最新数据
      await this.$nextTick(); // 等待 Vue 完成 DOM 更新
    },
    handleSelectionChange(val) {
      this.selectedWasteMaterials = val;
    },
    async handleBatchDelete() {
      if (this.selectedWasteMaterials.length === 0) {
        this.$message.warning('请选择要删除的废料！');
        return;
      }

      this.$confirm(`确定要删除选中的 ${this.selectedWasteMaterials.length} 条废料吗？`, '警告', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async() => {
        try {
          const ids = this.selectedWasteMaterials.map(item => item.id);
          // await Promise.all(ids.map(id => deleteWasteMaterial(id))); // 移除这行
          await batchDeleteWasteMaterials(ids); // 调用新的批量删除 API
          this.$message({
            type: 'success',
            message: `成功删除 ${ids.length} 条废料！`,
            duration: 2000
          });
          this.getList();
          this.selectedWasteMaterials = [];
        } catch (error) {
          this.$message({
            type: 'error',
            message: '批量删除失败！',
            duration: 2000
          });
          console.error(error);
        }
      }).catch(() => {
        // 用户取消删除
      });
    },
    async handleDeleteAll() {
      this.$confirm('确定要删除所有废料吗？此操作不可逆，请再次确认！', '警告', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.$confirm('您已选择删除所有废料，再次确认，所有数据将永久删除！', '最终警告', {
          confirmButtonText: '我确定删除',
          cancelButtonText: '取消',
          type: 'error'
        }).then(async () => {
          try {
            await deleteAllWasteMaterials();
            this.$message({
              type: 'success',
              message: '所有废料已成功删除！',
              duration: 2000
            });
            this.getList();
            this.selectedWasteMaterials = [];
          } catch (error) {
            this.$message({
              type: 'error',
              message: '删除所有废料失败！',
              duration: 2000
            });
            console.error(error);
          }
        }).catch(() => {
          this.$message.info('操作已取消。');
        });
      }).catch(() => {
        this.$message.info('操作已取消。');
      });
    }
  }
}
</script>
<style scoped>
.composition-item {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
.element-name {
  width: 50px;
  text-align: right;
  margin-right: 10px;
}
.percentage-sign {
  margin-left: 5px;
}
</style>
