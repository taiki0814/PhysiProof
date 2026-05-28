package com.physiproof.data

import androidx.room.*

@Dao
interface MeasurementDao {
    @Insert
    suspend fun insert(measurement: MeasurementEntity)

    @Query("SELECT * FROM measurements")
    suspend fun getAll(): List<MeasurementEntity>

    @Query("DELETE FROM measurements WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<Long>)
}
