# Create Plan API Contract

## Endpoint

- Method: `POST`
- Path: `/plans`
- Auth: `Authorization: Bearer <token>` (user role required)

## Request Body

Top-level fields:

- `goal` (string, required): 计划名称（服务端兼容主字段）
- `requirement` (string, required): 计划内容（服务端兼容主字段）
- `deadline` (string, required): ISO datetime, example `2026-07-10T00:00:00.000Z`
- `type` (enum, required): `general | study | work`
- `profile` (object, optional): 前端结构化扩展信息

`profile` shape:

```json
{
  "planMode": "basic",
  "basicInfo": {
    "planName": "健身入门",
    "planContent": "3个月稳定锻炼并控制饮食",
    "currentLevel": "newbie",
    "startDate": "2026-04-10",
    "cycle": "3m",
    "endDate": "2026-07-10",
    "preference": "",
    "timeInvestment": "5h_weekly",
    "outputMode": "phase-weekly"
  },
  "proSettings": {
    "aiDepth": "basic",
    "reminderMode": "standard"
  }
}
```

## Field Rules

### profile.planMode

- enum: `basic | pro`

### profile.basicInfo

- `planName` (string, required, non-empty)
- `planContent` (string, required, non-empty)
- `currentLevel` (enum, required): `none | newbie | junior | intermediate | advanced`
- `startDate` (string, required, valid date string, format recommended `YYYY-MM-DD`)
- `cycle` (enum, required): `1w | 1m | 3m | 6m | custom`
- `endDate` (string, required, valid date string)
- `preference` (string, required, can be empty string)
- `timeInvestment` (string, required, non-empty)
- `outputMode` (enum, required): `daily | phase-weekly | phase-monthly`

Additional constraint:

- If `cycle === "custom"`, then `endDate >= startDate`

### profile.proSettings (optional)

- `aiDepth` (enum, required when object present): `basic | advanced`
- `reminderMode` (enum, required when object present): `standard | smart`

## Validation Behavior

- Validation failed -> `400 Bad Request`
- Response body:

```json
{
  "message": "profile.basicInfo.currentLevel is invalid"
}
```

## Backward Compatibility

- Existing clients can continue sending only:
  - `goal`, `requirement`, `deadline`, `type`
- `profile` is optional and currently used as structured validation payload for future extension.
