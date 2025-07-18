<template>
  <div class="app-container">
    <!-- 生产记录 -->
    <el-card class="box-card">
      <div slot="header" class="clearfix">
        <span>生产管理</span>
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
        <el-table-column label="操作" width="150" align="center">
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
              v-if="isSuperAdmin"
              type="danger"
              size="mini"
              class="delete-btn"
              @click="handleDelete(row, $index)"
            >
              删除
            </el-button>
            <span v-if="!canApprove(row) && !isSuperAdmin">-</span>
          </template>
        </el-table-column>
      </el-table>

      <pagination v-show="total>0" :total="total" :page.sync="listQuery.page" :limit.sync="listQuery.limit" @pagination="fetchRecords" />

    </el-card>

  </div>
</template>

<script>
import {
  getProductionRecords, approveProductionRecord, deleteProductionRecord
} from '@/api/production'
import { parseTime } from '@/utils'
import Pagination from '@/components/Pagination' // secondary package based on el-pagination

export default {
  name: 'ProductionManagement',
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
      }
    }
  },
  computed: {
    isSuperAdmin() {
      return this.$store.getters.roles.includes('super_admin')
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
  created() {
    this.fetchRecords()
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
