"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import styles from './CustomDatePicker.module.css';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DatePickerProps {
  onRangeChange: (start: Date, end: Date) => void;
  value?: { start: Date; end: Date };
}

export default function CustomDatePicker({ onRangeChange, value }: DatePickerProps) {
  const today = new Date();

  // Estado inicial: Tudo (mostra todo o histórico ao abrir)
  const initialStart = value?.start ?? new Date(2020, 0, 1);
  const initialEnd = value?.end ?? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const [isOpen, setIsOpen] = useState(false);

  // Datas confirmadas (exibidas no botão e no calendário)
  const [startDate, setStartDate] = useState<Date>(initialStart);
  const [endDate, setEndDate] = useState<Date>(initialEnd);

  // Seleção temporária enquanto o usuário está clicando (só 1 clique feito)
  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  // O calendário sempre abre no mês da data inicial confirmada
  const [currentDate, setCurrentDate] = useState(new Date(initialStart));

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setPendingStart(null); // Cancela seleção incompleta ao fechar
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sincroniza o display com o filtro externo (pills do dashboard)
  useEffect(() => {
    if (value) {
      setStartDate(value.start);
      setEndDate(value.end);
      setCurrentDate(new Date(value.start));
    }
  }, [value?.start, value?.end]);

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDayClick = (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

    if (!pendingStart) {
      // Primeiro clique: guarda como pendente, não confirma ainda
      setPendingStart(clickedDate);
    } else {
      // Segundo clique: confirma o range
      let finalStart = pendingStart;
      let finalEnd = clickedDate;

      if (clickedDate < pendingStart) {
        finalStart = clickedDate;
        finalEnd = pendingStart;
      }

      const endOfDay = new Date(finalEnd.getFullYear(), finalEnd.getMonth(), finalEnd.getDate(), 23, 59, 59);

      // Atualiza estado confirmado
      setStartDate(finalStart);
      setEndDate(endOfDay);
      setPendingStart(null);
      setIsOpen(false);
      onRangeChange(finalStart, endOfDay);
    }
  };

  const toMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  // Usa pendingStart pra preview visual enquanto seleciona
  const effectiveStart = pendingStart ?? startDate;
  const effectiveEnd = pendingStart ? null : endDate;

  const isSelected = (day: number) => {
    const t = toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    const matchStart = toMidnight(effectiveStart) === t;
    const matchEnd = effectiveEnd && toMidnight(effectiveEnd) === t;
    return matchStart || !!matchEnd;
  };

  const isInRange = (day: number) => {
    if (!effectiveEnd) return false;
    const t = toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    return t > toMidnight(effectiveStart) && t < toMidnight(effectiveEnd);
  };

  const isRangeStart = (day: number) => {
    if (!effectiveEnd) return false;
    return toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day)) === toMidnight(effectiveStart);
  };

  const isRangeEnd = (day: number) => {
    if (!effectiveEnd) return false;
    return toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day)) === toMidnight(effectiveEnd);
  };

  const renderCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(
        <div key={day} className={styles.dayCell}>
          {(isInRange(day) || isRangeStart(day) || isRangeEnd(day)) && (
            <div className={`${styles.inRangeBg} ${isRangeStart(day) ? styles.start : ''} ${isRangeEnd(day) ? styles.end : ''}`} />
          )}
          <button
            className={`${styles.dayBtn} ${isSelected(day) ? styles.selected : ''}`}
            onClick={() => handleDayClick(day)}
          >
            {day}
          </button>
        </div>
      );
    }
    return days;
  };

  const formatDateRange = () => {
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
    if (pendingStart) return `${fmt(pendingStart)} - selecione o fim`;
    if (startDate.getFullYear() <= 2020) return 'Todo o período';
    return `${fmt(startDate)} - ${fmt(endDate)}`;
  };

  return (
    <div className={styles.container} ref={popoverRef}>
      <button className={styles.triggerBtn} onClick={() => setIsOpen(!isOpen)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon size={16} color="#a855f7" />
          {formatDateRange()}
        </span>
        <ChevronDown size={16} color="#8b8b93" />
      </button>

      {isOpen && (
        <div className={styles.popover}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '12px' }}>
            <span style={{ color: '#8b8b93' }}>PERÍODO PERSONALIZADO</span>
            <span style={{ color: '#a855f7', fontWeight: 500 }}>
              {pendingStart ? "2. Clique na data final" : "1. Clique na data inicial"}
            </span>
          </div>

          <div className={styles.calendarHeader}>
            <button className={styles.navBtn} onClick={handlePrevMonth}><ChevronLeft size={18} /></button>
            <div className={styles.monthTitle}>{MESES[currentDate.getMonth()]} {currentDate.getFullYear()}</div>
            <button className={styles.navBtn} onClick={handleNextMonth}><ChevronRight size={18} /></button>
          </div>

          <div className={styles.weekDays}>
            {DIAS_SEMANA.map(day => <div key={day}>{day}</div>)}
          </div>

          <div className={styles.daysGrid}>
            {renderCalendarDays()}
          </div>
        </div>
      )}
    </div>
  );
}