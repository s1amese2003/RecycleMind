<template>
  <div class="app-container">
    <!-- 生产记录 -->
    <el-card class="box-card">
      <div slot="header" class="clearfix">
        <span>生产管理</span>
        <el-button
          style="float: right; margin-left: 10px;"
          type="success"
          icon="el-icon-download"
          size="small"
          :loading="downloadLoading"
          @click="handleExport"
        >
          导出已完成记录
        </el-button>
      </div>
      <el-table v-loading="recordListLoading" :data="recordList" border fit highlight-current-row style="width: 100%">
        <el-table-column type="expand">
          <template slot-scope="{row}">
            <el-card shadow="never" style="margin: 10px;">
              <div slot="header">
                <span>配方详情 (计划ID: {{ row.id }})</span>
              </div>
              <el-table :data="getMaterials(row.materials_used)" border size="mini">
                <el-table-column prop="name" label="废料名称" />
                <el-table-column prop="amount" label="需要用量 (kg)" />
                <el-table-column prop="percentage" label="配比 (%)">
                  <template slot-scope="scope">
                    {{ scope.row.percentage.toFixed(2) }} %
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="计划ID" width="180" />
        <el-table-column prop="product_name" label="成品名称" />
        <el-table-column prop="actual_amount" label="计划产量 (kg)" />
        <el-table-column label="实际产量 (kg)" width="140">
          <template slot-scope="{row}">
            {{ row.actual_production_amount_kg || '未填写' }}
          </template>
        </el-table-column>
        <el-table-column prop="production_time" label="创建时间" width="160">
          <template slot-scope="{row}">
            <span>{{ row.production_time | parseTime('{y}-{m}-{d} {h}:{i}') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="创建人/审批人" width="120" />
        <el-table-column label="状态" width="120" align="center">
          <template slot-scope="{row}">
            <el-tag :type="row.quality_check | statusFilter">
              {{ row.quality_check }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="完成状态" width="100" align="center">
          <template slot-scope="{row}">
            <el-tag :type="row.is_finished | isFinishedFilter">
              {{ row.is_finished ? '已完成' : '未完成' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" align="center">
          <template slot-scope="{row, $index}">
            <el-button
              v-if="canApprove(row)"
              type="success"
              size="mini"
              :loading="row.loading"
              @click="handleApprove(row)"
            >
              批准生产
            </el-button>
            <el-button
              v-if="canComplete(row)"
              type="primary"
              size="mini"
              @click="handleComplete(row)"
              :disabled="!canOperateComplete"
            >
              完成生产
            </el-button>
            <el-button
              v-if="isSuperAdmin"
              type="danger"
              size="mini"
              class="delete-btn"
              @click="handleDelete(row, $index)"
            >
              删除
            </el-button>
            <span v-if="!canApprove(row) && !canComplete(row) && !isSuperAdmin">-</span>
          </template>
        </el-table-column>
      </el-table>

      <pagination v-show="total>0" :total="total" :page.sync="listQuery.page" :limit.sync="listQuery.limit" @pagination="fetchRecords" />

    </el-card>

    <!-- 完成生产计划对话框 -->
    <el-dialog title="完成生产计划" :visible.sync="completeDialogVisible" width="500px">
      <el-form :model="completeForm" ref="completeForm" label-width="120px">
        <el-form-item label="计划ID">
          <span>{{ completeForm.id }}</span>
        </el-form-item>
        <el-form-item label="计划产量 (kg)">
          <span>{{ completeForm.actual_amount }}</span>
        </el-form-item>
        <el-form-item label="实际产量 (kg)" prop="actual_production_amount_kg" :rules="[{ required: true, message: '请输入实际产量', trigger: 'blur' }]">
          <el-input-number v-model="completeForm.actual_production_amount_kg" :min="0" :precision="2" controls-position="right" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="是否完成" prop="is_finished">
          <el-switch v-model="completeForm.is_finished" active-text="已完成" inactive-text="未完成" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button @click="completeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmComplete">确定</el-button>
      </div>
    </el-dialog>

  </div>
</template>

<script>
import {
  getProductionRecords, approveProductionRecord, deleteProductionRecord, completeProductionRecord
} from '@/api/production'
import { parseTime } from '@/utils'
import Pagination from '@/components/Pagination' // secondary package based on el-pagination
import { export_json_to_excel } from '@/vendor/Export2Excel'

export default {
  name: 'Production',
  components: { Pagination },
  filters: {
    parseTime(time, cFormat) {
      if (!time) return ''
      return parseTime(time, cFormat)
    },
    statusFilter(status) {
      const statusMap = {
        '已批准': 'success',
        '生产中': 'primary',
        '待审批': 'warning',
        '已取消': 'danger',
        '已完成': 'info'
      }
      return statusMap[status] || 'info'
    },
    isFinishedFilter(isFinished) {
      return isFinished ? 'success' : 'info'
    }
  },
  data() {
    return {
      recordList: [],
      total: 0,
      recordListLoading: true,
      listQuery: {
        page: 1,
        limit: 20
      },
      completeDialogVisible: false,
      completeForm: {
        id: null,
        actual_amount: 0,
        actual_production_amount_kg: 0,
        is_finished: false
      },
      downloadLoading: false // 导出加载状态
    }
  },
  computed: {
    isSuperAdmin() {
      return this.$store.getters.roles.includes('super_admin')
    },
    // 只有超级管理员或审批员可以操作完成生产功能
    canOperateComplete() {
      const roles = this.$store.getters.roles
      return roles.includes('super_admin') || roles.includes('approver')
    },
    // 假设 'super_admin', 'admin', 'approver' 角色可以审批
    canApproveRole() {
      const roles = this.$store.getters.roles
      return roles.includes('super_admin') || roles.includes('admin') || roles.includes('approver')
    },
    username() {
      return this.$store.getters.name
    }
  },
  activated() {
    this.fetchRecords()
  },
  created() {
  },
  methods: {
    fetchRecords() {
      this.recordListLoading = true
      getProductionRecords(this.listQuery).then(response => {
        // 在前端为每行数据添加一个 loading 标志
        this.recordList = response.data.items.map(v => {
          this.$set(v, 'loading', false) //
          return v
        })
        this.total = response.data.total || response.data.items.length
        this.recordListLoading = false
      })
    },
    getMaterials(materialsData) {
      if (typeof materialsData === 'string') {
        try {
          return JSON.parse(materialsData);
        } catch (e) {
          return [];
        }
      }
      return materialsData || [];
    },
    canApprove(row) {
      return row.quality_check === '待审批' && this.canApproveRole
    },
    canComplete(row) {
      // 生产中或已批准的计划可以被完成，且未完成
      return (row.quality_check === '生产中' || row.quality_check === '已批准') && !row.is_finished
    },
    handleApprove(row) {
      this.$confirm(`确定要批准生产计划 ${row.id} 吗？此操作将立即从库存扣减所需废料。`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        row.loading = true
        approveProductionRecord(row.id, { approver: this.username })
          .then(response => {
            this.$message({
              message: response.data.message || '批准成功！',
              type: 'success'
            })
            // 更新该行数据
            row.quality_check = '已批准'
            row.operator = this.username
          })
          .catch(error => {
            // 错误处理已在 request.js 中完成，这里不需要重复弹窗
          })
          .finally(() => {
            row.loading = false
          })
      }).catch(() => {
        // 用户取消
      });
    },
    handleComplete(row) {
      this.completeForm = {
        id: row.id,
        actual_amount: row.actual_amount,
        actual_production_amount_kg: row.actual_production_amount_kg || row.actual_amount, // 默认填充计划产量
        is_finished: row.is_finished || false
      };
      this.completeDialogVisible = true;
    },
    confirmComplete() {
      this.$refs.completeForm.validate(valid => {
        if (valid) {
          const { id, actual_production_amount_kg, is_finished } = this.completeForm;
          completeProductionRecord(id, { actual_production_amount_kg, is_finished })
            .then(response => {
              this.$message({
                message: response.data.message || '生产计划已成功完成！',
                type: 'success'
              });
              this.completeDialogVisible = false;
              this.fetchRecords(); // 刷新列表以显示更新后的状态和实际产量
            })
            .catch(error => {
              // 错误处理已在 request.js 中完成，这里不需要重复弹窗
            });
        }
      });
    },
    handleExport() {
      this.downloadLoading = true;
      // 获取所有已完成的生产记录，不分页
      getProductionRecords({ is_finished: 'true', limit: 9999, page: 1 })
        .then(response => {
          const records = response.data.items;
          const header = ['成品名称', '计划产量 (kg)', '实际产量 (kg)', '创建时间', '审批人'];
          const filterVal = ['product_name', 'actual_amount', 'actual_production_amount_kg', 'production_time', 'operator'];

          const data = this.formatJson(filterVal, records);

          export_json_to_excel({
            header: header,
            data,
            filename: '已完成生产记录'
          });
          this.$message.success('导出成功！');
        })
        .catch(error => {
          this.$message.error('导出失败: ' + (error.response?.data?.message || error.message));
        })
        .finally(() => {
          this.downloadLoading = false;
        });
    },
    formatJson(filterVal, jsonData) {
      return jsonData.map(v => filterVal.map(j => {
        if (j === 'production_time') {
          return parseTime(v[j], '{y}-{m}-{d} {h}:{i}');
        } else {
          return v[j];
        }
      }));
    },
    handleDelete(row, index) {
      this.$confirm(`确定要永久删除生产计划 ${row.id} 吗？此操作不可恢复。`, '危险操作确认', {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'error'
      }).then(() => {
        deleteProductionRecord(row.id).then(() => {
          this.$message({
            message: '删除成功！',
            type: 'success'
          });
          this.recordList.splice(index, 1);
          this.total -= 1;
        }).catch(err => {
          // 错误已由请求拦截器处理
        });
      }).catch(() => {
        // 用户取消
      });
    }
  }
}
</script>

<style scoped>
.box-card {
  width: 100%;
}
.delete-btn {
  margin-left: 10px;
}
</style>
