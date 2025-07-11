<template>
  <div class="app-container">
    <!-- 生产记录 -->
    <el-card class="box-card">
      <div slot="header" class="clearfix">
        <span>生产记录</span>
        <el-button style="float: right; padding: 3px 0" type="text" icon="el-icon-plus" @click="handleRecordCreate">新增记录</el-button>
      </div>
      <el-table v-loading="recordListLoading" :data="recordList" border style="width: 100%">
        <el-table-column prop="id" label="记录ID" width="180" />
        <el-table-column prop="productName" label="成品名称" />
        <el-table-column prop="actualAmount" label="实际产量" />
        <el-table-column prop="unit" label="单位" />
        <el-table-column prop="productionTime" label="生产时间">
          <template slot-scope="{row}">
            <span>{{ row.productionTime | parseTime('{y}-{m}-{d} {h}:{i}') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作员" />
        <el-table-column prop="qualityCheck" label="质检结果" />
        <el-table-column label="操作" width="150">
          <template slot-scope="{row, $index}">
            <el-button type="primary" size="mini" @click="handleRecordUpdate(row)">编辑</el-button>
            <el-button type="danger" size="mini" @click="handleRecordDelete(row, $index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <pagination v-show="total>0" :total="total" :page.sync="listQuery.page" :limit.sync="listQuery.limit" @pagination="fetchRecords" />

    </el-card>

    <!-- 生产记录对话框 -->
    <el-dialog :title="recordTextMap[recordDialogStatus]" :visible.sync="recordDialogFormVisible">
      <el-form ref="recordDataForm" :rules="recordRules" :model="recordTemp" label-position="left" label-width="120px" style="width: 400px; margin-left:50px;">
        <el-form-item label="成品名称" prop="productName">
          <el-input v-model="recordTemp.productName" />
        </el-form-item>
        <el-form-item label="实际产量" prop="actualAmount">
          <el-input-number v-model="recordTemp.actualAmount" :min="0" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <el-input v-model="recordTemp.unit" />
        </el-form-item>
        <el-form-item label="生产时间" prop="productionTime">
          <el-date-picker v-model="recordTemp.productionTime" type="datetime" placeholder="选择日期时间" />
        </el-form-item>
        <el-form-item label="操作员" prop="operator">
          <el-input v-model="recordTemp.operator" />
        </el-form-item>
        <el-form-item label="质检结果" prop="qualityCheck">
          <el-input v-model="recordTemp.qualityCheck" />
        </el-form-item>
        <el-form-item label="质检报告" prop="qualityReport">
          <el-input v-model="recordTemp.qualityReport" type="textarea" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button @click="recordDialogFormVisible = false">取消</el-button>
        <el-button type="primary" @click="recordDialogStatus==='create'?createRecordData():updateRecordData()">确认</el-button>
      </div>
    </el-dialog>

  </div>
</template>

<script>
import {
  getProductionRecords, addProductionRecord, updateProductionRecord, deleteProductionRecord
} from '@/api/production'
import { parseTime } from '@/utils'
import Pagination from '@/components/Pagination' // secondary package based on el-pagination

// 格式化日期为 YYYY-MM-DD HH:mm:ss
function formatDateTime(date) {
  if (!date) return ''
  const d = new Date(date)
  const pad = n => n < 10 ? '0' + n : n
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export default {
  name: 'ProductionManagement',
  components: { Pagination },
  filters: {
    parseTime(time, cFormat) {
      if (!time) return ''
      return parseTime(time, cFormat)
    },
    planStatusFilter(status) {
      const statusMap = {
        '已完成': 'success',
        '进行中': 'primary',
        '待执行': 'info',
        '已取消': 'danger'
      }
      return statusMap[status] || 'warning'
    }
  },
  data() {
    return {
      // 生产记录
      recordList: [],
      total: 0,
      recordListLoading: true,
      listQuery: {
        page: 1,
        limit: 20
      },
      recordDialogFormVisible: false,
      recordDialogStatus: '',
      recordTextMap: { update: '编辑记录', create: '新增记录' },
      recordTemp: {},
      recordRules: {
        productName: [{ required: true, message: '成品名称不能为空', trigger: 'blur' }],
        actualAmount: [{ required: true, message: '实际产量不能为空', trigger: 'blur' }],
        unit: [{ required: true, message: '单位不能为空', trigger: 'blur' }],
        productionTime: [{ required: true, message: '生产时间不能为空', trigger: 'change' }],
        operator: [{ required: true, message: '操作员不能为空', trigger: 'blur' }],
        qualityCheck: [{ required: true, message: '质检结果不能为空', trigger: 'blur' }]
      }
    }
  },
  created() {
    this.fetchRecords()
  },
  methods: {
    // --- 生产记录方法 ---
    fetchRecords() {
      this.recordListLoading = true
      getProductionRecords(this.listQuery).then(response => {
        this.recordList = response.data.items
        this.total = response.data.total
        this.recordListLoading = false
      })
    },
    resetRecordTemp() {
      this.recordTemp = {
        id: `record_${new Date().getTime()}`,
        productName: '',
        actualAmount: 0,
        unit: 'kg',
        productionTime: new Date(),
        operator: '',
        qualityCheck: '待质检',
        qualityReport: ''
      }
    },
    handleRecordCreate() {
      this.resetRecordTemp()
      this.recordDialogStatus = 'create'
      this.recordDialogFormVisible = true
      this.$nextTick(() => this.$refs['recordDataForm'].clearValidate())
    },
    createRecordData() {
      this.$refs['recordDataForm'].validate(valid => {
        if (valid) {
          const postData = {
            id: this.recordTemp.id,
            product_name: this.recordTemp.productName,
            actual_amount: this.recordTemp.actualAmount,
            unit: this.recordTemp.unit,
            production_time: formatDateTime(this.recordTemp.productionTime),
            operator: this.recordTemp.operator,
            quality_check: this.recordTemp.qualityCheck,
            quality_report: this.recordTemp.qualityReport,
            materials_used: this.recordTemp.materialsUsed
          }
          addProductionRecord(postData).then(() => {
            this.recordList.unshift(this.recordTemp)
            this.recordDialogFormVisible = false
            this.$notify({ title: '成功', message: '新增记录成功', type: 'success', duration: 2000 })
          })
        }
      })
    },
    handleRecordUpdate(row) {
      this.recordTemp = Object.assign({}, row)
      this.recordDialogStatus = 'update'
      this.recordDialogFormVisible = true
      this.$nextTick(() => this.$refs['recordDataForm'].clearValidate())
    },
    updateRecordData() {
      this.$refs['recordDataForm'].validate(valid => {
        if (valid) {
          updateProductionRecord(this.recordTemp.id, this.recordTemp).then(() => {
            const index = this.recordList.findIndex(v => v.id === this.recordTemp.id)
            this.recordList.splice(index, 1, this.recordTemp)
            this.recordDialogFormVisible = false
            this.$notify({ title: '成功', message: '更新记录成功', type: 'success', duration: 2000 })
          })
        }
      })
    },
    handleRecordDelete(row, index) {
      this.$confirm('此操作将永久删除该记录, 是否继续?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        deleteProductionRecord(row.id).then(() => {
          this.recordList.splice(index, 1)
          this.$notify({ title: '成功', message: '删除记录成功', type: 'success', duration: 2000 })
        })
      })
    }
  }
}
</script>

<style scoped>
.box-card {
  width: 100%;
}
</style>
