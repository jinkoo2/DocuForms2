like scripts/upload_pfcc_ct_morningqa_catphan/ct_qa_case_form_card.html, please make scripts/upload_igrt/edge_cone_form_card.html based on the report.html files in scripts/upload_igrt/_data/Edge_Cone/Data folder.

Gantry angles (G) should be one of the four values [0,90,180,270]. Please round to the closest integer.  the gantry angle is like a 360 degree clock... so any angle >345 and <=360, should be rounded to 0. like 355 is like G is -1 from zero and the closest should be 0. 

Likewise, the table Angles (T) are one of [90, 350, 0, 50, 90]. Please round the numbers to the closest, like the gantry angle. 

The collimator angles (C) are all zero. So, remove it from the label. 
Also, the three numbers in () are ({x_offset}, {y_offset}, d={offset}). There is no baseline.

kV has only "BB from IC", no "BB from FC", no "FC from IC"

Please order the form:
G=270, T=0 [MV]
G=0, T=0 [MV]
G=90, T=0 [MV]
G=180, T=0 [MV]
G=180, T=270 [MV]
G=180, T=310 [MV]
G=180, T=50 [MV]
G=180, T=90 [MV]
G=0, T=0 [KV]
G=90, T=0 [KV]




