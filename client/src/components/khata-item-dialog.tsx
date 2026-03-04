import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/lib/i18n";
import type { KhataItem } from "@shared/schema";

const EXPENSE_CATEGORIES = [
  { value: "farm_preparation", labelKey: "farmPreparation" as const },
  { value: "seed_cost", labelKey: "seedCost" as const },
  { value: "plantation", labelKey: "plantation" as const },
  { value: "fertiliser", labelKey: "fertiliser" as const },
  { value: "pesticide", labelKey: "pesticide" as const },
  { value: "manual_weed", labelKey: "manualWeed" as const },
  { value: "watering_labour", labelKey: "wateringLabour" as const },
  { value: "harvest", labelKey: "harvest" as const },
];

const SUB_TYPES: Record<string, { value: string; labelKey: string }[]> = {
  farm_preparation: [
    { value: "cultivator", labelKey: "cultivator" },
    { value: "plow", labelKey: "plow" },
    { value: "rotavator", labelKey: "rotavator" },
    { value: "dhal_pata", labelKey: "dhalPata" },
    { value: "others", labelKey: "others" },
  ],
  seed_cost: [
    { value: "raw_seed", labelKey: "rawSeedCost" },
    { value: "transportation", labelKey: "seedTransportation" },
    { value: "seed_treatment", labelKey: "seedTreatment" },
  ],
  plantation: [
    { value: "tractor", labelKey: "tractor" },
    { value: "labor", labelKey: "labor" },
  ],
  fertiliser: [
    { value: "dap", labelKey: "dap" },
    { value: "mop", labelKey: "mop" },
    { value: "urea", labelKey: "urea" },
    { value: "potash", labelKey: "potash" },
    { value: "zinc", labelKey: "zinc" },
    { value: "ssp", labelKey: "ssp" },
    { value: "others", labelKey: "others" },
  ],
  pesticide: [
    { value: "herbicide", labelKey: "herbicide" },
    { value: "pesticide", labelKey: "pesticide" },
    { value: "insecticide", labelKey: "insecticide" },
    { value: "others", labelKey: "others" },
  ],
  harvest: [
    { value: "tractor", labelKey: "tractor" },
    { value: "harvester", labelKey: "harvester" },
    { value: "transport", labelKey: "transportCharges" },
    { value: "labour", labelKey: "labourCharges" },
    { value: "cold_store", labelKey: "coldStoreCharges" },
  ],
};

function hasSubTypes(category: string) {
  return SUB_TYPES[category] && SUB_TYPES[category].length > 0;
}

function hasHoursField(category: string) {
  return category === "farm_preparation";
}

function hasRateField(category: string) {
  return ["farm_preparation", "plantation", "watering_labour", "fertiliser"].includes(category);
}

function getRateLabel(category: string): string {
  if (category === "fertiliser") return "ratePerBag";
  if (category === "watering_labour") return "perBighaRate";
  return "perBighaHourCost";
}

interface KhataItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: any) => void;
  editItem?: KhataItem | null;
  isPending: boolean;
}

export function KhataItemDialog({ open, onOpenChange, onSave, editItem, isPending }: KhataItemDialogProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split("T")[0];

  const [date, setDate] = useState(today);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [subType, setSubType] = useState("");
  const [hours, setHours] = useState("");
  const [perBighaRate, setPerBighaRate] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (editItem) {
      setDate(editItem.date);
      setExpenseCategory(editItem.expenseCategory);
      setSubType(editItem.subType || "");
      setHours(editItem.hours || "");
      setPerBighaRate(editItem.perBighaRate || "");
      setTotalCost(editItem.totalCost);
      setRemarks(editItem.remarks || "");
      setIsPaid(editItem.isPaid);
    } else {
      setDate(today);
      setExpenseCategory("");
      setSubType("");
      setHours("");
      setPerBighaRate("");
      setTotalCost("");
      setRemarks("");
      setIsPaid(false);
    }
  }, [editItem, open]);

  const handleCategoryChange = (val: string) => {
    setExpenseCategory(val);
    setSubType("");
    setHours("");
    setPerBighaRate("");
  };

  const handleSubmit = () => {
    if (!expenseCategory || !totalCost) return;
    onSave({
      date,
      expenseCategory,
      subType: subType || null,
      hours: hours || null,
      perBighaRate: perBighaRate || null,
      totalCost,
      remarks: remarks || null,
      isPaid,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? t("editItem") : t("addItem")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t("date")}</Label>
            <Input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              data-testid="input-item-date"
            />
          </div>

          <div>
            <Label>{t("expenseCategory")}</Label>
            <Select value={expenseCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger data-testid="select-expense-category">
                <SelectValue placeholder={t("expenseCategory")} />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {t(cat.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {expenseCategory && hasSubTypes(expenseCategory) && (
            <div>
              <Label>{t("subType")}</Label>
              <Select value={subType} onValueChange={setSubType}>
                <SelectTrigger data-testid="select-sub-type">
                  <SelectValue placeholder={t("subType")} />
                </SelectTrigger>
                <SelectContent>
                  {SUB_TYPES[expenseCategory].map(st => (
                    <SelectItem key={st.value} value={st.value}>
                      {t(st.labelKey as any)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {expenseCategory && hasHoursField(expenseCategory) && (
            <div>
              <Label>{t("hoursTaken")}</Label>
              <Input
                type="number"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder={t("hoursTaken")}
                data-testid="input-hours"
              />
            </div>
          )}

          {expenseCategory && hasRateField(expenseCategory) && (
            <div>
              <Label>{t(getRateLabel(expenseCategory) as any)}</Label>
              <Input
                type="number"
                value={perBighaRate}
                onChange={e => setPerBighaRate(e.target.value)}
                placeholder={t(getRateLabel(expenseCategory) as any)}
                data-testid="input-rate"
              />
            </div>
          )}

          <div>
            <Label>{t("totalCost")}</Label>
            <Input
              type="number"
              value={totalCost}
              onChange={e => setTotalCost(e.target.value)}
              placeholder="₹"
              data-testid="input-total-cost"
            />
          </div>

          <div>
            <Label>{t("remarks")}</Label>
            <Input
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder={t("remarks")}
              data-testid="input-remarks"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={isPaid}
              onCheckedChange={setIsPaid}
              data-testid="switch-paid"
            />
            <Label>{isPaid ? t("paid") : t("unpaid")}</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              data-testid="button-cancel-item"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!expenseCategory || !totalCost || isPending}
              className="flex-1"
              data-testid="button-save-item"
            >
              {isPending ? t("loading") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
