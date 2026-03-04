import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

export const SUB_TYPES: Record<string, { value: string; labelKey: string }[]> = {
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

const MACHINERY_OPTIONS = [
  { value: "harvester", labelKey: "machineryHarvester" as const },
  { value: "pesticide_spray", labelKey: "machineryPesticideSpray" as const },
  { value: "plantar", labelKey: "machineryPlantar" as const },
  { value: "rotavator", labelKey: "machineryRotavator" as const },
  { value: "seed_drill", labelKey: "machinerySeedDrill" as const },
  { value: "thresher", labelKey: "machineryThresher" as const },
  { value: "tractor", labelKey: "machineryTractor" as const },
  { value: "tractor_trolley", labelKey: "machineryTractorTrolley" as const },
  { value: "others", labelKey: "machineryOthers" as const },
];

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
  khataType?: string;
}

export function KhataItemDialog({ open, onOpenChange, onSave, editItem, isPending, khataType }: KhataItemDialogProps) {
  const { t } = useTranslation();
  const today = new Date().toISOString().split("T")[0];
  const isBatai = khataType === "batai";
  const isRental = khataType === "rental";
  const isMachineryExpense = khataType === "machinery_expense";

  const [date, setDate] = useState(today);
  const [expenseCategory, setExpenseCategory] = useState("");
  const [subType, setSubType] = useState("");
  const [hours, setHours] = useState("");
  const [perBighaRate, setPerBighaRate] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [expenseBornBy, setExpenseBornBy] = useState("batai_ratio");

  const [rentalMachinery, setRentalMachinery] = useState("");
  const [rentalFarmWork, setRentalFarmWork] = useState("");
  const [rentalChargesPerBigha, setRentalChargesPerBigha] = useState("");
  const [rentalChargesPerHour, setRentalChargesPerHour] = useState("");
  const [rentalHoursVal, setRentalHoursVal] = useState("");
  const [rentalBigha, setRentalBigha] = useState("");
  const [rentalTotalCharges, setRentalTotalCharges] = useState("");
  const [rentalRemarks, setRentalRemarks] = useState("");
  const [rentalIsPaid, setRentalIsPaid] = useState(false);

  const computedRentalTotal = (() => {
    const b = (parseFloat(rentalChargesPerBigha) || 0) * (parseFloat(rentalBigha) || 0);
    const h = (parseFloat(rentalChargesPerHour) || 0) * (parseFloat(rentalHoursVal) || 0);
    return b + h;
  })();
  const effectiveRentalTotal = rentalTotalCharges !== "" ? rentalTotalCharges : (computedRentalTotal > 0 ? computedRentalTotal.toString() : "");

  useEffect(() => {
    if (editItem) {
      setDate(editItem.date);
      if (isRental) {
        setRentalMachinery(editItem.rentalMachinery || "");
        setRentalFarmWork(editItem.rentalFarmWork || "");
        setRentalChargesPerBigha(editItem.rentalChargesPerBigha || "");
        setRentalChargesPerHour(editItem.rentalChargesPerHour || "");
        setRentalHoursVal(editItem.rentalHours || "");
        setRentalBigha(editItem.rentalBigha || "");
        setRentalTotalCharges(editItem.rentalTotalCharges || "");
        setRentalRemarks(editItem.rentalRemarks || "");
        setRentalIsPaid(editItem.rentalIsPaid || false);
      } else {
        setExpenseCategory(editItem.expenseCategory);
        setSubType(editItem.subType || "");
        setHours(editItem.hours || "");
        setPerBighaRate(editItem.perBighaRate || "");
        setTotalCost(editItem.totalCost);
        setRemarks(editItem.remarks || "");
        setIsPaid(editItem.isPaid);
        setExpenseBornBy(editItem.expenseBornBy || "batai_ratio");
      }
    } else {
      setDate(today);
      setExpenseCategory("");
      setSubType("");
      setHours("");
      setPerBighaRate("");
      setTotalCost("");
      setRemarks("");
      setIsPaid(false);
      setExpenseBornBy("batai_ratio");
      setRentalMachinery("");
      setRentalFarmWork("");
      setRentalChargesPerBigha("");
      setRentalChargesPerHour("");
      setRentalHoursVal("");
      setRentalBigha("");
      setRentalTotalCharges("");
      setRentalRemarks("");
      setRentalIsPaid(false);
    }
  }, [editItem, open]);

  const handleCategoryChange = (val: string) => {
    setExpenseCategory(val);
    setSubType("");
    setHours("");
    setPerBighaRate("");
  };

  const handleSubmit = () => {
    if (isRental) {
      if (!rentalMachinery || !date) return;
      const finalTotal = effectiveRentalTotal || computedRentalTotal.toString();
      onSave({
        date,
        expenseCategory: "rental",
        totalCost: "0",
        rentalMachinery,
        rentalFarmWork: rentalFarmWork || null,
        rentalChargesPerBigha: rentalChargesPerBigha || null,
        rentalChargesPerHour: rentalChargesPerHour || null,
        rentalHours: rentalHoursVal || null,
        rentalBigha: rentalBigha || null,
        rentalTotalCharges: finalTotal,
        rentalRemarks: rentalRemarks || null,
        rentalIsPaid,
      });
      return;
    }
    if (isMachineryExpense) {
      if (!expenseCategory || !totalCost) return;
      onSave({
        date,
        expenseCategory,
        totalCost,
        remarks: remarks || null,
        isPaid,
      });
      return;
    }
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
      ...(isBatai ? { expenseBornBy } : {}),
    });
  };

  const isDisabled = isRental ? (!rentalMachinery || !date) : (!expenseCategory || !totalCost);

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

          {isRental ? (
            <>
              <div>
                <Label>{t("rentalMachinery")} *</Label>
                <Select value={rentalMachinery} onValueChange={setRentalMachinery}>
                  <SelectTrigger data-testid="select-rental-item-machinery">
                    <SelectValue placeholder={t("selectMachinery")} />
                  </SelectTrigger>
                  <SelectContent>
                    {MACHINERY_OPTIONS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{t(m.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("rentalFarmWork")}</Label>
                <Input value={rentalFarmWork} onChange={e => setRentalFarmWork(e.target.value)} placeholder={t("rentalFarmWork")} data-testid="input-rental-item-farm-work" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("chargesPerBigha")}</Label>
                  <Input type="number" min="0" value={rentalChargesPerBigha} onChange={e => { setRentalChargesPerBigha(e.target.value); setRentalTotalCharges(""); }} placeholder="₹0" data-testid="input-rental-item-charges-bigha" />
                </div>
                <div>
                  <Label>{t("chargesPerHour")}</Label>
                  <Input type="number" min="0" value={rentalChargesPerHour} onChange={e => { setRentalChargesPerHour(e.target.value); setRentalTotalCharges(""); }} placeholder="₹0" data-testid="input-rental-item-charges-hour" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("rentalBigha")}</Label>
                  <Input type="number" step="0.5" min="0" value={rentalBigha} onChange={e => { setRentalBigha(e.target.value); setRentalTotalCharges(""); }} placeholder="0" data-testid="input-rental-item-bigha" />
                </div>
                <div>
                  <Label>{t("rentalHours")}</Label>
                  <Input type="number" step="0.5" min="0" value={rentalHoursVal} onChange={e => { setRentalHoursVal(e.target.value); setRentalTotalCharges(""); }} placeholder="0" data-testid="input-rental-item-hours" />
                </div>
              </div>
              <div>
                <Label>{t("rentalTotalCharges")}</Label>
                <Input type="number" min="0" value={effectiveRentalTotal} onChange={e => setRentalTotalCharges(e.target.value)} placeholder="₹0" data-testid="input-rental-item-total-charges" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={rentalIsPaid} onCheckedChange={setRentalIsPaid} data-testid="switch-rental-item-paid" />
                <Label>{rentalIsPaid ? t("paid") : t("unpaid")}</Label>
              </div>
              <div>
                <Label>{t("rentalRemarks")}</Label>
                <Textarea value={rentalRemarks} onChange={e => setRentalRemarks(e.target.value)} placeholder={t("rentalRemarks")} rows={2} data-testid="input-rental-item-remarks" />
              </div>
            </>
          ) : isMachineryExpense ? (
            <>
              <div>
                <Label>{t("expenseCategory")} *</Label>
                <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                  <SelectTrigger data-testid="select-machinery-expense-category">
                    <SelectValue placeholder={t("selectCategory")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fuel">{t("fuel")}</SelectItem>
                    <SelectItem value="maintenance">{t("maintenance")}</SelectItem>
                    <SelectItem value="others">{t("others")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("totalCost")} *</Label>
                <Input type="number" min="0" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="₹" data-testid="input-machinery-expense-amount" />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={isPaid} onCheckedChange={setIsPaid} data-testid="switch-machinery-expense-paid" />
                <Label>{isPaid ? t("paid") : t("unpaid")}</Label>
              </div>
              <div>
                <Label>{t("remarks")}</Label>
                <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder={t("remarks")} data-testid="input-machinery-expense-remarks" />
              </div>
            </>
          ) : (
            <>
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

              {isBatai && (
                <div>
                  <Label>{t("expenseBornBy")}</Label>
                  <Select value={expenseBornBy} onValueChange={setExpenseBornBy}>
                    <SelectTrigger data-testid="select-expense-born-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="batai_ratio">{t("asPerBataiRatio")}</SelectItem>
                      <SelectItem value="owner">{t("farmOwner")}</SelectItem>
                      <SelectItem value="bataidar">{t("bataidar")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch
                  checked={isPaid}
                  onCheckedChange={setIsPaid}
                  data-testid="switch-paid"
                />
                <Label>{isPaid ? t("paid") : t("unpaid")}</Label>
              </div>
            </>
          )}

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
              disabled={isDisabled || isPending}
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
