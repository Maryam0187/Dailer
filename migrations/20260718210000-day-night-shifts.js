"use strict";

/** Day: 6:00 PM–11:00 PM PKT → 13:00–18:00 UTC. Night: 1:00 AM–6:00 AM PKT → 20:00–01:00 UTC. */
const DAY_DEFAULTS = {
  key: "day",
  name: "Day",
  startUtc: "13:00",
  endUtc: "18:00",
  timezone: "Asia/Karachi",
};

const NIGHT_DEFAULTS = {
  key: "night",
  name: "Night",
  startUtc: "20:00",
  endUtc: "01:00",
  timezone: "Asia/Karachi",
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("ShiftSettings", "key", {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.addColumn("ShiftSettings", "name", {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    const [rows] = await queryInterface.sequelize.query(
      "SELECT id FROM ShiftSettings ORDER BY id DESC",
    );

    const now = new Date();

    if (rows.length === 0) {
      await queryInterface.bulkInsert("ShiftSettings", [
        {
          ...DAY_DEFAULTS,
          enabled: true,
          leaveDays: JSON.stringify([0]),
          manuallyActive: true,
          afterShiftGrantDurationMinutes: 120,
          updatedBy: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          ...NIGHT_DEFAULTS,
          enabled: true,
          leaveDays: JSON.stringify([0]),
          manuallyActive: true,
          afterShiftGrantDurationMinutes: 120,
          updatedBy: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    } else {
      const primaryId = rows[0].id;
      await queryInterface.sequelize.query(
        `UPDATE ShiftSettings
         SET \`key\` = :key,
             \`name\` = :name,
             startUtc = :startUtc,
             endUtc = :endUtc,
             timezone = :timezone,
             updatedAt = NOW()
         WHERE id = :id`,
        {
          replacements: { ...DAY_DEFAULTS, id: primaryId },
        },
      );

      if (rows.length > 1) {
        const extraIds = rows.slice(1).map((r) => Number(r.id)).filter((id) => id !== primaryId);
        if (extraIds.length > 0) {
          await queryInterface.sequelize.query(
            `DELETE FROM ShiftSettings WHERE id IN (${extraIds.join(",")})`,
          );
        }
      }

      const [nightRows] = await queryInterface.sequelize.query(
        "SELECT id FROM ShiftSettings WHERE `key` = 'night' LIMIT 1",
      );
      if (nightRows.length === 0) {
        const [dayRows] = await queryInterface.sequelize.query(
          "SELECT enabled, leaveDays, manuallyActive, afterShiftGrantDurationMinutes FROM ShiftSettings WHERE id = :id",
          { replacements: { id: primaryId } },
        );
        const template = dayRows[0] || {};
        let leaveDays = template.leaveDays;
        if (leaveDays == null) leaveDays = JSON.stringify([0]);
        else if (typeof leaveDays !== "string") leaveDays = JSON.stringify(leaveDays);

        await queryInterface.bulkInsert("ShiftSettings", [
          {
            ...NIGHT_DEFAULTS,
            enabled: template.enabled !== false && template.enabled !== 0,
            leaveDays,
            manuallyActive: template.manuallyActive !== false && template.manuallyActive !== 0,
            afterShiftGrantDurationMinutes: template.afterShiftGrantDurationMinutes ?? 120,
            updatedBy: null,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
    }

    await queryInterface.changeColumn("ShiftSettings", "key", {
      type: Sequelize.STRING(16),
      allowNull: false,
    });
    await queryInterface.changeColumn("ShiftSettings", "name", {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
    await queryInterface.addIndex("ShiftSettings", ["key"], {
      unique: true,
      name: "shift_settings_key_unique",
    });

    await queryInterface.addColumn("Users", "shiftKey", {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: "day",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Users", "shiftKey");
    await queryInterface.sequelize.query("DELETE FROM ShiftSettings WHERE `key` = 'night'");
    await queryInterface.removeIndex("ShiftSettings", "shift_settings_key_unique").catch(() => {});
    await queryInterface.removeColumn("ShiftSettings", "name");
    await queryInterface.removeColumn("ShiftSettings", "key");
  },
};
